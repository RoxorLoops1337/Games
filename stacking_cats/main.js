// Stacking Cats: renderer, effects, HUD and screens. The rules live in sim.js.
import {
  CATS, CAT_BY_ID, SNACK_BY_ID, THEMES, STARTERS, START_CATS, MAX_STACK, MAX_BENCH, BOSS_EVERY, ENEMY_TYPES,
  emptyStats, checkUnlocks, mergeRun, unlockProgress,
  ITEM_BY_ID, MAX_STASH, FORGE_NEXT, FORGE_COUNT, itemSlots, BUILDINGS, BUILDING_BY_ID, emptyKingdom, buildingLevel, upgradeCost, buyUpgrade, kingdomLevel,
  DIFFS, CAT_TAGS, SYNERGIES, synergyText, ROUTE_BY_ID, dayKey, dayInfo, WONDERS, WONDER_BY_ID, buyWonder, ACHIEVEMENTS,
} from './cats.js';
import { createKingdomScene } from './kingdom_scene.js';
import { encodeSave, decodeSave } from './savecode.js';
import { dailyScore, fetchBoard, submitScore, rankOf } from './daily.js';
import { drawBuilding } from './art_kingdom.js';
import * as S from './sim.js';
import { drawCat } from './art_cats.js';
import { enemySprite, nestSprite, nestOverlay, makeBackdrop, drawBackdrop, drawRays, drawFront } from './art_world.js';
import { Sfx } from './audio.js';
import { createPost, ambientFor, lightSprite } from './post.js';
import { mix } from './art_util.js';
import { iconCanvas, installGlyphs } from './art_icons.js';

const SAVE_KEY = 'stacking_cats_save_v1';
const W = S.W, H = S.H, GROUND = S.GROUND, SLOT = S.SLOT;
const FONT = '"Baloo 2","Nunito","Arial Rounded MT Bold","Trebuchet MS",system-ui,sans-serif';
const $ = (id) => document.getElementById(id);
const app = $('app'), cv = $('cv'), ctx = cv.getContext('2d'), screenEl = $('screen');
const sfx = new Sfx();

// ---------------------------------------------------------------- save
const DEFAULT_OPT = { shake: 1, colorblind: false, bigText: false, quality: 'auto', motion: true, sfxVol: 1, musicVol: 0.7, tutorial: true };
function freshSave() {
  return { v: 1, stats: emptyStats(), unlocked: [...STARTERS], sound: true, music: true, tips: {}, kingdom: emptyKingdom(), meter: true, diff: 'normal', name: '', ach: {}, catStats: {}, daily: {}, opt: { ...DEFAULT_OPT } };
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
    ach: { ...(s.ach || {}) }, catStats: { ...(s.catStats || {}) }, daily: { ...(s.daily || {}) },
    diff: ['cozy', 'normal', 'hard'].includes(s.diff) ? s.diff : 'normal', name: String(s.name || ''),
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
  const cap = save.opt.quality === 'low' ? 1 : 2;
  res = Math.max(1, Math.min(cap, k * dpr * quality));
  const pw = Math.round(W * res);
  if (cv.width !== pw) { cv.width = pw; cv.height = Math.round(H * res); }
}
function applyOptions() {
  const o = save.opt, cl = document.body.classList;
  cl.toggle('cb', !!o.colorblind); cl.toggle('bigtext', !!o.bigText); cl.toggle('nomotion', !o.motion); cl.toggle('touch', coarse);
  sfx.setVolumes(o.sfxVol, o.musicVol);
  fxCap = o.quality === 'low' ? 180 : 440;
  gfx = o.quality === 'low' ? 0 : 3;
  quality = 1;
  fit();
}
addEventListener('resize', fit); applyOptions();
installGlyphs(app);

// ---------------------------------------------------------------- sprites
const catSprites = new Map(), silSprites = new Map();
function catSprite(id, variant = 'open') {
  const key = variant === 'open' ? id : id + ':' + variant;
  let c = catSprites.get(key);
  if (!c) {
    c = document.createElement('canvas'); c.width = c.height = 240;
    const x = c.getContext('2d'); x.scale(2, 2); drawCat(x, CAT_BY_ID[id], variant);
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
  });
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
  if (!backdrops.has(idx)) backdrops.set(idx, makeBackdrop(THEMES[idx], idx));
  bd = backdrops.get(idx); bdIdx = idx;
}

// ---------------------------------------------------------------- screens (DOM)
let coachEl = null;
function hideCoach() { if (coachEl) { coachEl.remove(); coachEl = null; } }
// a friendly speech bubble for the first runs. dir says which way the little tail points.
function coach(key, html, x, y, dir = 'down') {
  if (!save.opt.tutorial || save.tips[key]) return;
  hideCoach();
  save.tips[key] = true; persist();
  const el = document.createElement('div');
  el.className = 'coach ' + dir; el.style.left = x + 'px'; el.style.top = y + 'px';
  el.innerHTML = `<span class="cico">&#128049;</span><div>${html}</div><button>Got it</button>`;
  el.querySelector('button').addEventListener('click', (e) => { e.stopPropagation(); sfx.play('ui'); hideCoach(); });
  app.appendChild(el); coachEl = el;
  setTimeout(() => { if (coachEl === el) hideCoach(); }, 14000);
}
function setScreen(html, cls = '') {
  hideCoach();
  screenEl.innerHTML = html ? `<div class="screen ${cls}">${html}</div>` : '';
  paintThumbs(screenEl);
}
const closeScreen = () => setScreen('');
screenEl.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act]');
  if (!t || t.hasAttribute('disabled')) return;
  sfx.unlock(); sfx.music(sfx.mode);
  const fn = acts[t.dataset.act];
  if (fn) { sfx.play('ui'); fn(t.dataset, t); }
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
const STAT_LABEL = { dmg: 'Damage', haste: 'Attack speed', hp: 'Health', crit: 'Crit chance', range: 'Range', dr: 'Damage taken', waveHeal: 'Healing per wave', slow: 'Mouse speed', curse: 'Mouse weakness', coin: 'Coins' };
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
  const m2 = { ...m };
  let lines = '';
  for (const k in s.fx) {
    if (k === 'critMul') continue;
    m2[k] = (m2[k] || 0) + s.fx[k] * sm;
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
function itemCard(id) {
  const it = ITEM_BY_ID[id];
  return `<div class="card item r-${it.rarity}" data-act="pickItem" data-id="${id}"><div class="rar">${it.rarity}</div><div class="ic">${it.icon}</div><h3>${it.name}</h3><p>${it.desc}</p><div class="impact">Equip it on any cat</div></div>`;
}

const thumbURLs = new Map();
function thumbURL(id) {
  let u = thumbURLs.get(id);
  if (!u) { const c = document.createElement('canvas'); c.width = c.height = 48; c.getContext('2d').drawImage(catSprite(id), 0, 0, 48, 48); u = c.toDataURL(); thumbURLs.set(id, u); }
  return u;
}

function showTitle() {
  mode = 'title'; paused = false;
  const total = save.stats, k = save.kingdom, d = DIFFS[save.diff];
  const can = BUILDINGS.some((b) => buildingLevel(k, b.id) < b.max && k.coins >= upgradeCost(b.id, buildingLevel(k, b.id))) || WONDERS.some((w) => !k.wonders[w.id] && k.gems >= w.cost);
  const day = dayKey(), di = dayInfo(day), played = save.daily[day];
  const trophies = ACHIEVEMENTS.filter((a) => save.ach[a.id]).length;
  setScreen(`
    <h1 class="logo">Stacking<span>Cats</span></h1>
    <div class="tag">Stack your cats. Merge them. Smash the mouse nests.</div>
    <div class="row"><button class="btn big" data-act="play">Play</button><button class="btn small grey" data-act="diff" title="Change difficulty">${d.icon} ${d.name}</button></div>
    <div class="row"><button class="btn green" data-act="kingdom">Kingdom <span class="badge">&#129689; ${num(k.coins)}${k.gems ? ` &middot; &#128142; ${k.gems}` : ''}</span>${can ? '<i class="bang">!</i>' : ''}</button><button class="btn pink" data-act="daily">Daily ${di.mod.icon}${played ? '' : '<i class="bang">!</i>'}</button><button class="btn" data-act="dex">Cat Dex ${save.unlocked.length}/${CATS.length}</button></div>
    <div class="row"><button class="btn grey small" data-act="trophies">Trophies ${trophies}/${ACHIEVEMENTS.length}</button><button class="btn grey small" data-act="settings">Settings</button><button class="btn grey small" data-act="how">How to play</button></div>
    <div class="hint">${total.runs ? `Best wave ${total.bestWave} &middot; ${total.kills} mice defeated &middot; ${total.bossKills} nests destroyed` : 'Tap Play to begin'}</div>`, 'clear');
  acts = {
    play: () => startRun(), dex: () => showDex(showTitle), how: () => showHow(showTitle), kingdom: () => showKingdom(showTitle),
    daily: () => showDaily(showTitle), trophies: () => showTrophies(showTitle), settings: () => showSettings(showTitle),
    diff: () => { const order = ['cozy', 'normal', 'hard']; save.diff = order[(order.indexOf(save.diff) + 1) % 3]; persist(); showTitle(); },
  };
  setBackdrop(0);
  sfx.music('calm');
}

// ---------------------------------------------------------------- settings, with save backup
function showSettings(back, msg) {
  const o = save.opt;
  const seg = (key, opts, cur) => `<div class="seg">${opts.map(([v, l]) => `<button class="${String(cur) === String(v) ? 'on' : ''}" data-act="opt" data-k="${key}" data-v="${v}">${l}</button>`).join('')}</div>`;
  const tog = (key, label, cur, hint = '') => `<button class="tog ${cur ? 'on' : ''}" data-act="tog" data-k="${key}"><span>${label}${hint ? `<small>${hint}</small>` : ''}</span><i></i></button>`;
  setScreen(`<h2>Settings</h2><div class="setgrid">
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
        ${tog('tutorial', 'Tutorial hints', o.tutorial, 'Little tips during your first runs')}
        <div class="setrow"><b>Leaderboard name</b><input type="text" maxlength="12" value="${save.name.replace(/"/g, '')}" placeholder="Your name" data-n="1"></div>
        <div class="setrow"><b>Save backup</b><div class="row"><button class="btn small grey" data-act="export">Copy save code</button><button class="btn small grey" data-act="import">Restore from code</button></div>
        <small>${msg || 'Moves your cats, coins and trophies to another device.'}</small></div>
      </div></div>
    <div class="row"><button class="btn" data-act="back">Back</button><button class="btn small grey" data-act="tipsreset">Replay tutorial</button><button class="btn small grey" data-act="erase">Erase all progress</button></div>`);
  screenEl.querySelectorAll('input[type=range]').forEach((r) => r.addEventListener('input', () => { save.opt[r.dataset.r] = r.value / 100; persist(); sfx.setVolumes(save.opt.sfxVol, save.opt.musicVol); if (r.dataset.r === 'sfxVol') sfx.play('coin'); }));
  screenEl.querySelectorAll('input[data-n]').forEach((r) => r.addEventListener('input', () => { save.name = r.value.replace(/[^\w \-.']/g, '').slice(0, 12); persist(); }));
  let erase = false;
  acts = {
    back,
    opt: (d) => {
      if (d.k === 'diff') save.diff = d.v; else if (d.k === 'quality') { save.opt.quality = d.v; } else save.opt[d.k] = +d.v;
      persist(); applyOptions(); showSettings(back);
    },
    tog: (d) => { save.opt[d.k] = !save.opt[d.k]; persist(); applyOptions(); showSettings(back); },
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
function showTrophies(back) {
  const list = ACHIEVEMENTS.slice().sort((a, b) => (save.ach[b.id] ? 1 : 0) - (save.ach[a.id] ? 1 : 0));
  const done = list.filter((a) => save.ach[a.id]).length;
  setScreen(`<h2>Trophies <small class="klv">${done}/${list.length}</small></h2>
    <div class="trophies">${list.map((a) => `<div class="tro ${save.ach[a.id] ? 'got' : ''}"><span class="medal">${save.ach[a.id] ? '&#127942;' : '&#128274;'}</span><div><b>${a.name}</b><small>${a.desc}</small></div><em>${a.coins ? `&#129689;${a.coins}` : ''}${a.gems ? ` &#128142;${a.gems}` : ''}</em></div>`).join('')}</div>
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
  setScreen(`<h2>How to play</h2><ul class="how">
    <li><b>Your stack fights by itself.</b> Cats walk right and attack. Mice come from the right.</li>
    <li><b>Order matters.</b> Mice bite the bottom cat first. Put tough cats low. Higher cats see farther.</li>
    <li><b>Every wave</b> you pick a snack. <b>Every ${BOSS_EVERY}th wave</b> is a nest fight: destroy it to rescue a cat and win loot.</li>
    <li><b>Merge</b> two equal cats (same type and level) into one stronger cat, up to Lv 3. The tower fits ${MAX_STACK}, the bench fits ${MAX_BENCH}.</li>
    <li><b>Loot:</b> elite mice drop chests. Items go on one cat each (two at Lv 3). Tap Arrange tower to equip them.</li>
    <li><b>Coins</b> you earn are saved. Spend them in the <b>Kingdom</b> on buildings that make every future run stronger.</li>
    <li><b>Synergies:</b> cats of the same kind boost each other. Two give a bonus, three give a bigger one. Look for the badges next to the wave counter.</li>
    <li><b>Roads:</b> after each nest you choose the road to the next one. Riskier roads pay better.</li>
    <li><b>Daily Challenge:</b> everyone plays the same mice once a day. Climb the leaderboard.</li>
    <li><b>Zoomies</b> (Space): fill the meter by fighting, then make everyone much faster for 6 seconds.</li></ul>
    <div class="row"><button class="btn" data-act="back">Got it</button></div>`);
  acts = { back };
}

// ---------------------------------------------------------------- the Cat Dex, with how much each cat has done
function showDex(back) {
  const un = new Set(save.unlocked);
  let sel = null;
  const fav = Object.entries(save.catStats).sort((a, b) => b[1].runs - a[1].runs)[0];
  const draw = () => {
    setScreen(`<h2>Cat Dex</h2><div class="dex">${CATS.map((d) => {
      const u = un.has(d.id), p = unlockProgress(d, save.stats);
      return `<div class="tile ${u ? '' : 'locked'} ${sel === d.id ? 'sel' : ''}" data-act="tile" data-id="${d.id}"><canvas width="96" height="96" data-cat="${d.id}" ${u ? '' : 'data-lock="1"'}></canvas><b>${u ? d.name : '???'}</b>${u ? `<small>${d.role}</small>` : `<small>${p.need > 1 ? `${p.have}/${p.need}` : p.have ? 'Done' : 'Locked'}</small>`}${fav && fav[0] === d.id && u ? '<i class="fav">&#10084;</i>' : ''}</div>`;
    }).join('')}</div>
    <div class="detail">${sel ? dexDetail(sel, un.has(sel)) : 'Tap a cat to see how to unlock it, or how it has done for you. Locked cats join the picks once you earn them.'}</div>
    <div class="row"><button class="btn" data-act="back">Back</button></div>`);
  };
  draw();
  acts = { back, tile: (d) => { sel = d.id; draw(); sfx.meow(d.id, 'pick'); } };
}
function dexDetail(id, unlocked) {
  const d = CAT_BY_ID[id];
  if (unlocked) {
    const s = save.catStats[id], tags = (CAT_TAGS[id] || []).map((t) => `${SYNERGIES[t].icon} ${SYNERGIES[t].name}`).join(', ');
    return `<b>${d.name}, ${d.title}</b> (${d.role}). ${d.desc}<br><small>${tags ? `Teams up as: ${tags}. ` : ''}${s ? `Used in ${s.runs} run${s.runs === 1 ? '' : 's'}, best wave ${s.best}, ${num(s.dmg)} total damage, ${num(s.kills)} mice defeated.` : 'Not used yet.'}</small>`;
  }
  const p = unlockProgress(d, save.stats);
  return `<b>Locked.</b> To unlock: ${d.unlock.text}${p.need > 1 ? ` (${p.have}/${p.need})` : ''}.<div class="pbar"><i style="width:${(100 * p.have) / p.need}%"></i></div>`;
}

// ---------------------------------------------------------------- the daily challenge
function showDaily(back) {
  const day = dayKey(), di = dayInfo(day), mine = save.daily[day];
  setScreen(`<h2>Daily Challenge</h2>
    <div class="dailycols"><div class="dcard"><div class="dic">${di.mod.icon}</div><b>${di.mod.name}</b><p>${di.mod.desc}</p>
      <small>Everyone plays the same mice today, with the same cats: the starters plus Yuki, Hawkeye, Boomer, Pudding, Shadow, Ronin, Merlin and Cutlass. Kingdom upgrades are switched off, so it is a fair race.</small>
      <div class="dstat">${mine ? `Your best today: <b>${mine.best}</b> (wave ${mine.wave})` : 'You have not played today yet. A first try earns a gem!'}</div>
      <div class="row"><button class="btn big" data-act="go">Play daily</button></div></div>
      <div class="board"><h4>Today's top cats</h4><div id="boardBody" class="bbody">Loading...</div></div></div>
    <div class="row"><button class="btn grey" data-act="back">Back</button></div>`);
  acts = { back, go: () => startRun({ daily: true }) };
  fetchBoard(day).then((r) => {
    const el = $('boardBody');
    if (!el || !el.isConnected) return;
    el.innerHTML = r.ok ? boardHtml(r.top) : '<small>The leaderboard is offline right now. You can still play!</small>';
  });
}
function boardHtml(top, me) {
  if (!top.length) return '<small>No scores yet today. Be the first!</small>';
  return top.slice(0, 10).map((e, i) => `<div class="brow ${e.name === (me || save.name) ? 'me' : ''}"><span>${i + 1}</span><b>${e.name}</b><em>wave ${e.wave}</em><strong>${e.score}</strong></div>`).join('');
}

// ---------------------------------------------------------------- the Cat Kingdom: a village you can tap
let kScene = null;
function showKingdom(back, selected) {
  if (kScene) { kScene.stop(); kScene = null; }
  const k = save.kingdom;
  let sel = selected || null;
  const detail = () => {
    if (!sel) return '<div class="kd hint2">Tap a building to upgrade it, or a floating wonder to buy it with gems.</div>';
    if (sel.type === 'wonder') {
      const w = WONDER_BY_ID[sel.id], owned = !!k.wonders[w.id], afford = !owned && k.gems >= w.cost;
      return `<div class="kd"><span class="kic">${w.icon}</span><div class="kt"><b>${w.name}</b><small>${w.desc}</small></div><button class="btn small ${afford ? 'green' : 'grey'}" data-act="buyw" data-id="${w.id}" ${afford ? '' : 'disabled'}>${owned ? 'Built' : `Buy &#128142; ${w.cost}`}</button></div>`;
    }
    const b = BUILDING_BY_ID[sel.id], l = buildingLevel(k, b.id), maxed = l >= b.max, cost = maxed ? 0 : upgradeCost(b.id, l), afford = !maxed && k.coins >= cost;
    return `<div class="kd"><span class="kic">${b.icon}</span><div class="kt"><b>${b.name} <span class="pips">${Array.from({ length: b.max }, (_, i) => `<i class="${i < l ? 'on' : ''}"></i>`).join('')}</span></b><small>${l ? `Now: ${b.text(l)}` : b.blurb}</small>${maxed ? '<small class="nx">Fully upgraded!</small>' : `<small class="nx">Next: ${b.text(l + 1)}</small>`}</div><button class="btn small ${afford ? 'green' : 'grey'}" data-act="buy" data-id="${b.id}" ${afford ? '' : 'disabled'}>${maxed ? 'Complete' : `${l ? 'Upgrade' : 'Build'} &#129689; ${cost}`}</button></div>`;
  };
  setScreen(`<h2>Cat Kingdom <small class="klv">Lv ${kingdomLevel(k)}</small></h2>
    <div class="kcoins"><span>&#129689;</span> <b>${num(k.coins)}</b> <span class="gem">&#128142;</span> <b>${k.gems}</b> <small>${num(k.earned)} coins earned in total &middot; gems come from trophies and nests</small></div>
    <canvas id="kscene" width="1840" height="472"></canvas><div id="kdetail">${detail()}</div>
    <div class="row"><button class="btn" data-act="back">Back</button></div>`, 'kingdom');
  const refresh = () => { const el = $('kdetail'); if (el) el.innerHTML = detail(); };
  kScene = createKingdomScene($('kscene'), () => save.kingdom, (hit) => { sel = hit; sfx.play('ui'); refresh(); });
  if (sel) kScene.select(sel);
  acts = {
    back: () => { if (kScene) { kScene.stop(); kScene = null; } back(); },
    buy: (d) => {
      const b = BUILDING_BY_ID[d.id];
      if (buyUpgrade(save.kingdom, d.id)) {
        persist(); sfx.play('upgrade'); toast(`${b.icon} ${b.name} is now Lv ${buildingLevel(save.kingdom, d.id)}!`);
        const ach = checkAch({ ...(g ? g.run : {}), wave: 0 });
        for (const a of ach) toast(`Trophy: ${a.name}!`);
        kScene.bump(d.id);
        showKingdom(back, { type: 'building', id: d.id });
        if (kScene) kScene.bump(d.id);
      }
    },
    buyw: (d) => {
      const w = WONDER_BY_ID[d.id];
      if (buyWonder(save.kingdom, d.id)) { persist(); sfx.play('upgrade'); toast(`${w.icon} ${w.name} built!`); showKingdom(back, { type: 'wonder', id: d.id }); }
    },
  };
}

// ---------------------------------------------------------------- run flow
let startTotal = START_CATS, maxComboRun = 0;
function startRun(opts = {}) {
  sfx.unlock();
  const daily = opts.daily ? dayInfo(dayKey()) : null;
  g = S.newGame({ seed: (Math.random() * 2147483647) | 0, unlocked: [...save.unlocked], kingdom: save.kingdom, difficulty: save.diff, daily });
  startTotal = START_CATS + g.meta.startPicks;
  runCommitted = false; pickN = 0; fx.length = 0; speed = 1; paused = false; rewardChoices = null;
  combo = 0; maxComboRun = 0; coinShown = 0; dpsHist.length = 0; sfx.setIntensity(0);
  $('bSpeed').textContent = 'x1';
  showPickStart();
}

function showPickStart() {
  mode = 'pick';
  rewardChoices = rewardChoices || S.rollCatChoices(g);
  setScreen(`<h2>Choose friend ${pickN + 1} of ${startTotal}</h2><p class="sub">${pickN === 0 ? 'Every cat attacks differently. Pick the first one for your tower.' : 'Pick a friend to stack on top. Choosing the same cat again merges them!'}</p>
    <div class="cards">${rewardChoices.map((id) => catCard(id, { ribbon: owns(id) ? 'MERGE!' : '', gain: pickN > 0 })).join('')}</div>
    <div class="row hint">${rerollBtn()}</div>`);
  coach('c1', 'Tap a cat to pick it. Every cat fights in its own way, and you will find more along the way!', 480, 440, 'up');
  acts = {
    pickCat: (d) => {
      const prev = S.synergyState(g);
      const r = S.addCat(g, d.id);
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

function beginWave() {
  closeScreen();
  S.startWave(g);
  mode = 'play';
  setBackdrop(themeFor(g.wave));
  const boss = g.bossWave;
  const nest = g.enemies.find((e) => e.boss);
  const rt = g.route.id !== 'trail' && !boss ? ` \u00B7 ${g.route.name}` : '';
  banner(boss ? 'NEST BATTLE!' : `Wave ${g.wave}`, boss ? nest.name : `${THEMES[bdIdx].name}${rt}`, boss);
  sfx.play(boss ? 'boss' : 'wave');
  sfx.music(boss ? 'boss' : 'fight');
  dpsHist.length = 0;
  if (g.wave === 1) setTimeout(() => { if (mode === 'play') coach('c2', 'The bottom cat takes the hits. Tough cats go low, shooters go high!', 250, 120, 'left'); }, 2600);
}

function onClear() {
  mode = 'celebrate';
  celeb = g.bossWave ? 2.4 : 1.15;
  sfx.play(g.bossWave ? 'win' : 'clear');
  sfx.music('calm');
  banner(g.bossWave ? 'NEST DESTROYED!' : 'WAVE CLEARED!', g.bossWave ? 'A friend is free!' : '', false);
  confetti(g.towerX + 40, GROUND - 120, g.bossWave ? 60 : 26, 380);
  queue = g.reward.slice();
  if (g.bossWave) queue.splice(queue.length - 1, 0, 'route');
  if (g.report && g.report.chests) toast(`Opening ${g.report.chests} loot chest${g.report.chests > 1 ? 's' : ''}!`);
}
function nextReward() {
  const r = queue.shift();
  rewardChoices = null;
  if (!r) { beginWave(); return; }
  if (r === 'cat') showCatReward(); else if (r === 'item') showItemReward(); else if (r === 'route') showRouteReward(); else showSnackReward();
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

function showRouteReward() {
  rewardChoices = rewardChoices || S.rollRoutes(g);
  const effects = (r) => [
    r.enemyHp !== 1 ? `Mice health x${r.enemyHp}` : '', r.enemyDmg !== 1 ? `Mice damage x${r.enemyDmg}` : '', r.coin !== 1 ? `Coins x${r.coin}` : '',
    r.chest ? 'More loot chests' : '', r.rare ? 'Better loot' : '', r.speed !== 1 ? `Mice speed x${r.speed}` : '', r.bossHp !== 1 ? `Nest health x${r.bossHp}` : '', r.snackExtra ? '+1 snack choice' : '', r.healNow ? `Heal ${r.healNow * 100}% now` : '',
  ].filter(Boolean).map((x) => `<div class="impact">${x}</div>`).join('');
  setScreen(`<h2>Choose your road</h2><p class="sub">Where to next? This road shapes the next five waves and the next nest.</p>
    <div class="cards">${rewardChoices.map((id) => { const r = ROUTE_BY_ID[id]; return `<div class="card route" data-act="pickRoute" data-id="${id}"><div class="ic">${r.icon}</div><h3>${r.name}</h3><p>${r.desc}</p>${effects(r)}</div>`; }).join('')}</div>
    <div class="row hint">${rerollBtn()}</div>`);
  acts = {
    pickRoute: (d) => { S.chooseRoute(g, d.id); sfx.play('route'); toast(`${ROUTE_BY_ID[d.id].icon} ${ROUTE_BY_ID[d.id].name}`); nextReward(); },
    reroll: () => { if (S.useReroll(g)) { rewardChoices = null; sfx.play('reroll'); showRouteReward(); } },
  };
}

function showCatReward() {
  rewardChoices = rewardChoices || S.rollCatChoices(g);
  setScreen(`<h2>Nest destroyed!</h2><p class="sub">A caged cat is free and wants to join your stack. Who is it?</p>
    <div class="cards">${rewardChoices.map((id) => catCard(id, { ribbon: owns(id) ? 'MERGE!' : '', gain: true })).join('')}</div>
    <div class="row hint"><button class="btn small grey" data-act="tower">Arrange tower</button>${rerollBtn()}</div>`);
  acts = {
    pickCat: (d) => {
      const prev = S.synergyState(g);
      const r = S.addCat(g, d.id);
      if (!r.ok) { showFull(d.id); return; }
      sfx.play(r.merged ? 'merge' : 'pick'); sfx.meow(d.id, r.merged ? 'happy' : 'pick');
      notifySyn(prev);
      toast(r.merged ? `${CAT_BY_ID[d.id].name} merged to Lv ${r.cat.lvl}!` : `${CAT_BY_ID[d.id].name} joined${r.benched ? ' the bench' : ' the stack'}!`);
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

function showItemReward() {
  rewardChoices = rewardChoices || S.rollItemChoices(g);
  setScreen(`<h2>Loot!</h2><p class="sub">Pick a treasure. Each cat can carry one item (two at Lv 3).</p>
    <div class="cards">${rewardChoices.map(itemCard).join('')}</div>
    <div class="row hint"><button class="btn small grey" data-act="tower">Arrange tower</button>${rerollBtn()}</div>`);
  acts = {
    pickItem: (d) => {
      S.takeItem(g, d.id);
      sfx.play('chest');
      showTower(() => nextReward(), { item: g.stash.length - 1 });
    },
    tower: () => showTower(showItemReward),
    reroll: () => { if (S.useReroll(g)) { rewardChoices = null; sfx.play('reroll'); showItemReward(); } },
  };
}

function showSnackReward() {
  rewardChoices = rewardChoices || S.rollSnackChoices(g);
  const first = g.wave === 0 || !g.report;
  setScreen(`${first ? '<h2>Snack Stall bonus!</h2><p class="sub">Your kingdom gives you a free snack to start.</p>' : `<h2>Wave ${g.wave} cleared!</h2>`}${first ? '' : reportHtml()}
    <div class="cards">${rewardChoices.map(snackCard).join('')}</div>
    <div class="row hint"><button class="btn small grey" data-act="tower">Arrange tower</button><button class="btn small grey" data-act="stats">Team stats</button>${rerollBtn()}</div>`, first ? '' : 'wide');
  acts = {
    pickSnack: (d) => {
      S.eatSnack(g, d.id);
      sfx.play('pick');
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
  setScreen(`<h2>Team stats</h2><div class="statcols"><div>${stat}<div class="srow"><b>Run</b><strong></strong><span><i>${num(r.dmg)} damage</i><i>biggest hit ${num(r.biggest)}</i><i>${num(r.taken)} taken</i><i>${Math.floor(r.coins)} coins</i></span></div></div><div>${cs}</div></div>
    <div class="row"><button class="btn" data-act="back">Back</button></div>`, 'wide');
  acts = { back };
}

// arrange the tower: tap a cat then another to swap or merge; tap a backpack item then a cat to equip it
function showTower(back, opt = {}) {
  let sel = null, rel = false, selItem = opt.item != null ? opt.item : null;
  const catRow = (c, zone, i, extra = '') => {
    const d = CAT_BY_ID[c.id], mx = S.catMaxHp(g, c), mods = S.calcMods(g), dps = S.estDps(c, mods);
    const canMerge = sel && sel !== c.uid && (() => { const a = S.findCat(g, sel); return a && a.id === c.id && a.lvl === c.lvl && a.lvl < 3; })();
    let prev = '';
    if (selItem != null && g.stash[selItem]) {
      const items = c.items.slice();
      if (items.length >= itemSlots(c.lvl)) items.shift();
      items.push(g.stash[selItem]);
      const nd = S.estDps(c, mods, items), df = nd - dps;
      prev = `<em class="${df >= 0 ? 'up' : 'down'}">&rarr; &asymp;${Math.round(nd)} (${df >= 0 ? '+' : ''}${Math.round((100 * df) / Math.max(1, dps))}%)</em>`;
    }
    const slots = Array.from({ length: itemSlots(c.lvl) }, (_, k) => {
      const id = c.items[k];
      return id ? `<span class="islot full" data-act="unequip" data-uid="${c.uid}" data-i="${k}" title="${ITEM_BY_ID[id].name}: ${ITEM_BY_ID[id].desc} (tap to take off)">${ITEM_BY_ID[id].icon}</span>` : `<span class="islot ${selItem != null ? 'want' : ''}"></span>`;
    }).join('');
    return `<div class="slot has ${sel === c.uid ? 'sel' : ''} ${canMerge ? 'can' : ''} ${selItem != null ? 'eq' : ''}" data-act="slot" data-zone="${zone}" data-i="${i}"><canvas width="96" height="96" data-cat="${c.id}"></canvas><div class="sc"><b>${d.name} <span class="st">${stars(c.lvl)}</span></b><small>${d.role}${canMerge ? ' - tap to MERGE' : extra}</small><div class="hp"><i style="width:${Math.max(2, (100 * c.hp) / mx)}%"></i></div></div><div class="islots">${slots}</div><div class="sdps">&asymp;${Math.round(dps)}<small>DPS</small>${prev}</div></div>`;
  };
  const draw = () => {
    const tw = [];
    for (let i = S.stackMax(g) - 1; i >= 0; i--) tw.push(g.cats[i] ? catRow(g.cats[i], 'tower', i, i === 0 ? ' \u00B7 takes the hits' : '') : `<div class="slot" data-act="slot" data-zone="tower" data-i="${i}">&nbsp;Empty spot</div>`);
    const bn = [];
    for (let i = 0; i < S.benchMax(g); i++) bn.push(g.bench[i] ? catRow(g.bench[i], 'bench', i) : `<div class="slot" data-act="slot" data-zone="bench" data-i="${i}">&nbsp;Empty bench spot</div>`);
    const over = S.overflow(g);
    const cell = (id, i) => `<span class="bag ${ITEM_BY_ID[id].rarity} ${selItem === i ? 'sel' : ''} ${i >= MAX_STASH ? 'over' : ''}" data-act="bag" data-i="${i}" title="${ITEM_BY_ID[id].name}: ${ITEM_BY_ID[id].desc}">${ITEM_BY_ID[id].icon}</span>`;
    const bag = g.stash.map(cell).join('') + Array.from({ length: Math.max(0, MAX_STASH - g.stash.length) }, () => '<span class="bag empty"></span>').join('');
    const it = selItem != null && g.stash[selItem] ? ITEM_BY_ID[g.stash[selItem]] : null;
    const plan = it ? S.forgePlan(g, selItem) : null;
    const same = it ? g.stash.filter((x) => ITEM_BY_ID[x].rarity === it.rarity).length : 0;
    const acts2 = it
      ? `<button class="btn small amber fbtn" data-act="sell">Sell &#129689; +${S.sellValue(g, it.id)}</button><button class="btn small fbtn ${plan ? 'purple' : 'grey'}" data-act="forge" ${plan ? '' : 'disabled'} title="Melt three ${it.rarity} items into one ${FORGE_NEXT[it.rarity]} item">Forge ${Math.min(same, FORGE_COUNT)}/${FORGE_COUNT} &rarr; ${FORGE_NEXT[it.rarity]}</button>`
      : '';
    const syn = S.synergyState(g);
    const synChips = Object.entries(syn.counts).sort((a, b) => b[1] - a[1]).map(([t, n]) => { const tier = syn.tiers[t] || 0; return `<span class="schip ${tier ? 't' + tier : ''}" title="${SYNERGIES[t].name}: ${tier ? synergyText(t, tier) : 'needs 2 cats'}">${SYNERGIES[t].icon} ${SYNERGIES[t].name} ${n}/${n >= 3 ? 3 : n >= 2 ? 3 : 2}</span>`; }).join('');
    const msg = over
      ? `<b class="warn">Backpack is over full by ${over}.</b> Sell, forge or equip items to continue.`
      : it ? `<b>${it.icon} ${it.name}</b>: ${it.desc}. Tap a cat to equip it, or sell / forge it.` : sel ? 'Tap another cat to swap, or a matching one to merge.' : 'Tap a cat to move it. Tap a backpack item, then a cat, to equip it.';
    setScreen(`<h2>Arrange your tower <small class="klv">Team DPS &asymp; ${Math.round(teamDps(S.calcMods(g)))}</small></h2><div class="synrow">${synChips || '<small>Stack cats of the same kind for synergy bonuses!</small>'}</div>
      <div class="tbody"><div class="tower"><div class="col"><h4>Tower (top to bottom)</h4>${tw.join('')}<button class="btn small grey relbtn" data-act="release" ${sel ? '' : 'disabled'}>${rel ? 'Really release?' : 'Release cat'}</button></div><div class="col"><h4>Bench (rests, heals fast)</h4>${bn.join('')}
        <h4>Backpack <span class="${over ? 'warn' : ''}">${g.stash.length}/${MAX_STASH}</span></h4><div class="bagrow">${bag}</div></div></div></div>
      <div class="tfoot"><div class="detail slim ${over ? 'bad' : ''}"><span>${msg}</span></div>${acts2}<button class="btn big2" data-act="done" ${over ? 'disabled' : ''}>Done</button></div>`, 'wide arr');
    if (selItem != null) coach('c6', 'Now tap a cat to equip it. The green numbers show how much stronger that cat gets!', 790, 6);
    else coach('c4', 'Tap a cat, then another one to swap places. Two equal cats merge into one stronger cat!', 790, 6);
  };
  draw();
  acts = {
    done: () => { if (S.overflow(g) > 0) { toast('Sell, forge or equip items first'); return; } back(); },
    sell: () => { const v = S.sellItem(g, selItem); if (v) { sfx.play('coin'); toast(`Sold for +${v} coins`); } selItem = null; draw(); },
    forge: () => {
      const id = S.forgeItems(g, selItem);
      if (!id) return;
      sfx.play('merge'); toast(`Forged ${ITEM_BY_ID[id].name}!`); puff(S.TOWER_X, 330, 14, '#c88aff', 160, 0.6);
      selItem = g.stash.length - 1; draw();
    },
    bag: (d) => { selItem = selItem === +d.i ? null : +d.i; sel = null; draw(); },
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
        if (S.equipItem(g, selItem, cat.uid)) { sfx.play('equip'); toast(`${CAT_BY_ID[cat.id].name} equipped!`); puff(S.TOWER_X, 330, 8, '#ffd23f', 120, 0.5); }
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
        if (a.id === cat.id && a.lvl === cat.lvl && a.lvl < 3) { S.mergeCats(g, a.uid, cat.uid); sfx.play('merge'); toast(`Merged! ${CAT_BY_ID[a.id].name} is Lv ${a.lvl}`); } else S.swapCats(g, sel, cat.uid);
        sel = null;
      }
      notifySyn(prevSyn);
      draw();
    },
  };
}

function recordCatStats(run) {
  const seen = new Set([...g.cats, ...g.bench].map((c) => c.id));
  const row = (id) => save.catStats[id] || (save.catStats[id] = { runs: 0, dmg: 0, kills: 0, best: 0 });
  for (const id of seen) { const s = row(id); s.runs++; s.best = Math.max(s.best, run.wave); }
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
  run.gems = Math.floor(save.stats.bossKills / 3) - Math.floor(oldNests / 3);
  if (run.daily) {
    const score = dailyScore(run), prev = save.daily[run.daily];
    if (!prev) run.gems += 1;
    if (!prev || score > prev.best) save.daily[run.daily] = { best: score, wave: run.wave };
    run.dailyScore = score;
  }
  save.kingdom.gems += run.gems;
  recordCatStats(run);
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
  const dailyBox = r.daily ? `<div class="dailybox" id="dailyBox"><b>${dayInfo(r.daily).mod.icon} Daily score ${r.dailyScore}</b><span id="dailyMsg"></span></div>` : '';
  const trophies = (r.ach || []).length ? `<div class="trow">${r.ach.map((a) => `<span class="tchip">&#127942; ${a.name}</span>`).join('')}</div>` : '';
  setScreen(`<h2>The stack has fallen</h2><p class="sub">${r.wave >= best && r.wave > 1 ? 'A new personal best!' : 'The mice cheer. Next time you will get them.'} <small>${d.icon} ${d.name}${r.daily ? ' &middot; Daily' : ''}</small></p>
    <div class="overcols"><div><div class="stats"><div><b>${r.wave}</b>Wave reached</div><div><b>${r.kills}</b>Mice defeated</div><div><b>${r.bossKills}</b>Nests destroyed</div><div><b>${r.merges}</b>Merges</div>
      <div><b>${num(r.dmg)}</b>Damage dealt</div><div><b>${num(r.biggest)}</b>Biggest hit</div><div><b>${num(r.taken)}</b>Damage taken</div><div><b>${num(r.healed)}</b>Healed</div></div>
      <div class="earn">&#129689; <b id="earn" data-to="${r.earned}">0</b> <span>coins earned${r.gems ? ` &middot; &#128142; +${r.gems}` : ''}</span><small>Total ${num(k.coins)}</small></div>${dailyBox}</div>
      <div class="rbars big"><div class="rh"><b>Who did the work</b></div>${bars || '<small>No damage dealt</small>'}</div></div>
    ${trophies}${fresh.length ? `<p class="sub">New friends unlocked!</p><div class="newcats">${fresh.map((id) => catCard(id, { act: 'none' })).join('')}</div>` : ''}
    <div class="row"><button class="btn big" data-act="again">Try again</button><button class="btn green" data-act="kingdom">Kingdom</button><button class="btn grey" data-act="title">Title</button></div>`, 'wide');
  acts = {
    again: () => startRun({ daily: !!r.daily }), title: () => { g = null; showTitle(); }, kingdom: () => showKingdom(() => showOver(fresh)), none: () => {},
    sendscore: () => { const inp = screenEl.querySelector('input[data-n]'); if (inp) { save.name = inp.value.replace(/[^\w \-.']/g, '').slice(0, 12); persist(); } postDaily(); },
  };
  if ((r.ach || []).length) sfx.play('achieve');
  const el = $('earn');
  if (el) {
    const to = +el.dataset.to, t0 = performance.now();
    const tick = (now) => { const u = Math.min(1, (now - t0) / 1100); el.textContent = Math.round(to * (1 - Math.pow(1 - u, 3))); if (u < 1 && el.isConnected) { requestAnimationFrame(tick); if (Math.random() < 0.3) sfx.play('coin'); } };
    requestAnimationFrame(tick);
  }
  if (r.daily) postDaily();
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
  submitScore({ name: save.name, score: r.dailyScore, wave: r.wave, kills: r.kills, day: r.daily }).then((res) => {
    const el = $('dailyMsg');
    r.sent = res.ok ? `You are #${rankOf(res.top, save.name) || '?'} today!` : res.status === 429 ? 'Slow down a little, then try again.' : 'Could not reach the leaderboard.';
    if (el && el.isConnected) el.textContent = r.sent;
  });
}

function showPause() {
  paused = true;
  setScreen(`<h2 class="paused">Paused</h2><div class="row"><button class="btn big" data-act="resume">Resume</button></div><div class="row"><button class="btn grey" data-act="stats">Team stats</button><button class="btn grey" data-act="settings">Settings</button><button class="btn grey" data-act="how">How to play</button><button class="btn grey" data-act="quit">Give up</button></div>`);
  acts = {
    resume: () => { paused = false; closeScreen(); },
    stats: () => showStats(showPause),
    settings: () => showSettings(showPause),
    how: () => showHow(showPause),
    quit: () => { paused = false; if (g.wave > 1) commitRun(); g = null; showTitle(); },
  };
}


// ---------------------------------------------------------------- HUD
function banner(txt, sub, boss) {
  const b = $('banner');
  b.className = '';
  b.innerHTML = `${txt}${sub ? `<small>${sub}</small>` : ''}`;
  void b.offsetWidth;
  b.className = 'show' + (boss ? ' boss' : '');
}
function toast(txt) {
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = txt;
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), 3300);
  while ($('toasts').children.length > 3) $('toasts').firstChild.remove();
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
  setText('themeTxt', THEMES[bdIdx] ? THEMES[bdIdx].name : '');
  const inStage = ((g.wave - 1) % BOSS_EVERY) + 1;
  if (hudCache.pips !== inStage) { hudCache.pips = inStage; $('nestPips').innerHTML = Array.from({ length: BOSS_EVERY }, (_, i) => `<i class="${i === BOSS_EVERY - 1 ? 'boss' : ''} ${i + 1 <= inStage ? 'on' : ''}"></i>`).join(''); }
  const nest = g.enemies.find((e) => e.boss && !e.dead);
  $('bossBar').style.display = playing && nest ? 'block' : 'none';
  if (nest) {
    setText('bossName', nest.name);
    const pct = Math.max(0, 100 * nest.hp / nest.maxHp).toFixed(1) + '%';
    if (hudCache.bossPct !== pct) { hudCache.bossPct = pct; $('bossHp').style.width = pct; $('bossTrail').style.width = pct; }
  } else hudCache.bossPct = null;
  const zr = g.zoomT > 0, z = $('zoom');
  z.style.display = playing ? 'flex' : 'none';
  z.style.setProperty('--p', (zr ? 100 * g.zoomT / g.zoomMax : g.zoom) + '%');
  z.className = zr ? 'on' : g.zoom >= 100 ? 'ready' : '';
  setText('zoomSub', zr ? 'GO!' : g.zoom >= 100 ? 'READY' : Math.floor(g.zoom) + '%');
  // coins count up smoothly, chests show while waiting to be opened
  coinShown += (g.run.coins - coinShown) * Math.min(1, dt * 7);
  if (Math.abs(g.run.coins - coinShown) < 0.5) coinShown = g.run.coins;
  setText('coinTxt', String(Math.floor(coinShown)));
  const ch = g.chests;
  $('chestBox').style.display = ch > 0 ? 'flex' : 'none';
  setText('chestTxt', String(ch));
  $('bMeter').classList.toggle('on', !!save.meter);
  if (playing && g.zoom >= 100 && !zr && !save.tips.c5) coach('c5', 'Zoomies are ready! Tap the glowing button, or press Space, for super speed!', 830, 104, 'right');
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
    gr.addColorStop(0, hexA(col, 1)); gr.addColorStop(0.3, hexA(col, 0.6)); gr.addColorStop(1, hexA(col, 0));
    x.fillStyle = gr; x.fillRect(0, 0, rr * 2, rr * 2);
    glowCache.set(key, c);
  }
  return c;
}
function glow(x, y, r, col, a = 1) { ctx.globalAlpha = a; ctx.drawImage(glowSprite(col, r), x - r, y - r, r * 2, r * 2); }
const add = () => { ctx.globalCompositeOperation = 'lighter'; };
const norm = () => { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; };

const moods = new Map();
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
const hit = (t) => { hitstop = Math.max(hitstop, t); };
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
function confetti(x, y, n, spread = 320) {
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, v = spread * (0.4 + Math.random() * 0.8);
    spawnFx({ k: 'cf', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 16, col: CONF[i % CONF.length], life: 1.4 + Math.random() * 0.8, max: 2.2 });
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

function handle(e) {
  switch (e.k) {
    case 'dmg':
      if (e.v >= 1) txtFx(e.x, e.y, Math.round(e.v), e.crit ? '#ffe14d' : '#ffffff', e.crit ? 24 : 14, e.crit ? 0.95 : 0.65);
      if (e.crit) { sparks(e.x, e.y, 6, '#ffe14d', 180, 0.3); hit(0.03); shake = Math.max(shake, 2.5); }
      break;
    case 'kill': {
      if (e.quiet) { puff(e.x, e.y, 3, '#ffffff', 60, 0.4); break; }
      combo++; comboT = 2.4; comboPulse = 1; maxComboRun = Math.max(maxComboRun, combo); cheerRandom(0.12);
      if (combo === 50) for (const a of checkAch({ ...g.run, maxCombo: combo })) { toast(`Trophy: ${a.name}!`); sfx.play('achieve'); }
      spawnFx({ k: 'corpse', type: e.type, elite: e.elite, x: e.x, y: e.y, vx: 60 + Math.random() * 90, vy: -230 - Math.random() * 90, rot: 0, vr: 6 + Math.random() * 8, life: 0.7, max: 0.7 });
      puff(e.x, e.y, e.elite ? 14 : 6, e.elite ? '#ffd23f' : '#ffffff', 110, 0.5, 4);
      sparks(e.x, e.y, e.elite ? 12 : 5, e.elite ? '#ffd23f' : '#fff6b0', 190, 0.3);
      spawnFx({ k: 's', x: e.x, y: e.y - 6, life: 0.4, max: 0.4 });
      if (e.elite) { flashGlow(e.x, e.y, 70, '#ffd23f', 0.35); hit(0.05); shake = Math.max(shake, 4); }
      sfx.play('pop', Math.min(2.2, 1 + combo * 0.035));
      if (combo === 10 || combo === 25 || combo === 50 || combo === 100) { txtFx(g.towerX + 70, 250, combo + ' COMBO!', '#ff8fb7', 30, 1.3); sfx.play('pick'); zpunch = Math.max(zpunch, 0.02); }
      break;
    }
    case 'swipe':
      spawnFx({ k: 'a', x: e.x, y: e.y, wide: e.wide, life: 0.2, max: 0.2 });
      sparks(e.x, e.y, 4, '#ffffff', 170, 0.22); hit(0.018);
      sfx.play('swipe'); break;
    case 'flame':
      for (let i = 0; i < 6; i++) spawnFx({ k: 'f', x: e.x + Math.random() * e.len, y: e.y + (Math.random() - 0.5) * (6 + i * 4), vy: -34 - Math.random() * 34, r: 12 + Math.random() * 14, life: 0.38, max: 0.38 });
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
    case 'pellet': bolt([{ x: e.x, y: e.y }, { x: e.x2, y: e.y2 }], '#ffe9a0', 1.8, 0.12); sparks(e.x2, e.y2, 1, '#ffe9a0', 120, 0.2); break;
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
    case 'ko': { const kc = S.findCat(g, e.uid); if (kc) sfx.meow(kc.id, 'sad'); emote(e.uid, '\uD83D\uDCAB', 1.6); const p = catPos(e.uid); txtFx(p.x, p.y - 30, 'KO!', '#ff8a8a', 26, 1.2); puff(p.x, p.y, 10, '#ffd1e0', 100, 0.6); sparks(p.x, p.y, 8, '#ff8a8a', 200, 0.4); shake = Math.max(shake, 9); hit(0.1); slowmo(0.5, 0.4); screenFlash('rgba(255,80,80,.22)', 0.25); sfx.play('ko'); break; }
    case 'revive': { const rc = S.findCat(g, e.uid); if (rc) { sfx.meow(rc.id, 'happy'); moods.set(e.uid, 1.5); } const p = catPos(e.uid); txtFx(p.x, p.y - 30, 'Back up!', '#fff6b0', 22, 1.2); puff(p.x, p.y, 12, '#fff6b0', 100, 0.7); flashGlow(p.x, p.y, 70, '#fff6b0', 0.5); sfx.play('heal'); break; }
    case 'heal': { if (Math.random() < 0.25) emote(e.uid, '\u2764\uFE0F', 1); const p = catPos(e.uid); txtFx(p.x - 46, p.y - 20, '+' + Math.round(e.v), '#7dffb0', 16, 0.9); break; }
    case 'healfx': for (let i = 0; i < 3; i++) spawnFx({ k: 'h', x: e.x + (Math.random() - 0.5) * 50, y: e.y - 10, life: 0.9, max: 0.9 }); sfx.play('heal'); break;
    case 'cathit': { if (Math.random() < 0.18) emote(e.uid, '\uD83D\uDCA2', 0.8); const p = catPos(e.uid); txtFx(p.x - 56, p.y, Math.round(e.v), '#ff8a8a', 15, 0.7); towerWob = 1; shake = Math.max(shake, 1.8); sfx.play('hit'); break; }
    case 'coin': if (fx.length < 300) spawnFx({ k: 'fly', x: e.x, y: e.y, sx: e.x, sy: e.y, tx: 52, ty: 72, life: 0.7 + Math.random() * 0.2, max: 0.8, kind: 'coin', ox: (Math.random() - 0.5) * 160, oy: -60 - Math.random() * 60 }); break;
    case 'chest': spawnFx({ k: 'fly', x: e.x, y: e.y, sx: e.x, sy: e.y, tx: 150, ty: 72, life: 1.0, max: 1.0, kind: 'chest', ox: 0, oy: -90 }); sparks(e.x, e.y, 10, '#ffd23f', 220, 0.5); txtFx(e.x, e.y - 20, 'Chest!', '#ffd23f', 20, 1); sfx.play('chest'); break;
    case 'dodge': { const p = catPos(e.uid); txtFx(p.x - 40, p.y, 'Miss!', '#b9f5ff', 16, 0.7); break; }
    case 'ehit': sparks(e.x, e.y, 3, '#ffffff', 130, 0.2); break;
    case 'spawn': smoke(e.x, e.y, 1, 7, '#d9c9a0'); puff(e.x, e.y - 10, 3, '#d9c9a0', 50, 0.4, 4); break;
    case 'roar': shake = Math.max(shake, 13); zpunch = Math.max(zpunch, 0.03); txtFx(e.x, e.y, 'SQUEAK!', '#ff9a9a', 32, 1.1); screenFlash('rgba(255,40,40,.18)', 0.3); sfx.play('roar'); break;
    case 'bossDown': {
      ring(e.x, e.y - 60, 200, '#fff6b0', 0.9, 14); ring(e.x, e.y - 60, 120, '#ffffff', 0.6, 8);
      flashGlow(e.x, e.y - 60, 260, '#fff2c0', 0.7);
      puff(e.x, e.y - 60, 40, '#ffd23f', 280, 1, 7); sparks(e.x, e.y - 60, 40, '#fff6b0', 420, 0.8); smoke(e.x, e.y - 40, 8, 22, '#b8aab8');
      confetti(e.x, e.y - 60, 70, 420);
      shake = 20; zpunch = 0.07; hit(0.16); slowmo(1.2, 0.28); screenFlash('rgba(255,255,230,.5)', 0.4);
      sfx.play('boom'); break;
    }
    case 'zoom': banner('ZOOMIES!', '', false); screenFlash('rgba(255,160,210,.25)', 0.25); zpunch = Math.max(zpunch, 0.03); sfx.play('zoom'); break;
    case 'nine': txtFx(S.TOWER_X + 40, 260, 'NINE LIVES!', '#ffd23f', 36, 1.6); puff(S.TOWER_X, 330, 30, '#ffd23f', 200, 0.9, 6); flashGlow(S.TOWER_X, 330, 200, '#ffd23f', 0.6); screenFlash('rgba(255,230,120,.35)', 0.4); sfx.play('heal'); break;
    case 'merge': puff(S.TOWER_X, 330, 20, '#ffd23f', 160, 0.7, 5); moods.set(e.uid, 1.6); emote(e.uid, '\u2B50', 1.2); break;
    default: break;
  }
}
function drain() { for (const e of g.ev) handle(e); g.ev.length = 0; }

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
      case 'fly': { const u = 1 - f.life / f.max, e = u * u * (3 - 2 * u); f.x = f.sx + (f.tx - f.sx) * e + f.ox * Math.sin(u * Math.PI) * (1 - u); f.y = f.sy + (f.ty - f.sy) * e + f.oy * Math.sin(u * Math.PI); break; }
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
      ctx.drawImage(sp.c, -sp.ax, -sp.ay, sp.w, sp.h); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a * 0.7; ctx.drawImage(sp.c, -sp.ax, -sp.ay, sp.w, sp.h); ctx.restore();
    } else if (f.k === 's') { ctx.globalAlpha = a; ctx.fillStyle = '#fff6b0'; for (let i = 0; i < 4; i++) { const an = i * 1.57 + (1 - a) * 2, d = (1 - a) * 24 + 4; ctx.beginPath(); ctx.arc(f.x + Math.cos(an) * d, f.y + Math.sin(an) * d, 2.6 * a + 0.6, 0, TAU); ctx.fill(); } }
    else if (f.k === 'a') { ctx.globalAlpha = a; ctx.strokeStyle = '#fff'; ctx.lineCap = 'round'; for (let i = 0; i < 3; i++) { ctx.lineWidth = 3.4 - i; ctx.beginPath(); ctx.arc(f.x + 16, f.y, (f.wide ? 46 : 28) + i * 6 + (1 - a) * 8, Math.PI * 0.62, Math.PI * 1.38); ctx.stroke(); } }
    else if (f.k === 'fly') { ctx.globalAlpha = 1; if (f.kind === 'coin') { ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#8a5a14'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(f.x, f.y, 5.5 * Math.abs(Math.cos(f.life * 14)) + 1.2, 5.5, 0, 0, TAU); ctx.fill(); ctx.stroke(); } else ctx.drawImage(iconSprite('\uD83C\uDF81'), f.x - 13, f.y - 13, 26, 26); }
    else if (f.k === 'h') { ctx.globalAlpha = Math.min(1, a * 2); ctx.drawImage(iconSprite('♥'), f.x - 8, f.y - 12, 16, 16); }
    ctx.globalCompositeOperation = 'source-over';
  }
  // pass 2: additive light
  add();
  for (const f of fx) {
    const a = Math.max(0, f.life / f.max);
    if (f.k === 'g') glow(f.x, f.y, f.r * (1.2 - a * 0.3), f.col, a * 0.62);
    else if (f.k === 'f') glow(f.x, f.y, Math.max(3, f.r), a > 0.5 ? '#ffb040' : '#ff5a1f', a * 0.85);
    else if (f.k === 'sp') { ctx.globalAlpha = a; ctx.strokeStyle = f.col; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x - f.vx * 0.04, f.y - f.vy * 0.04); ctx.stroke(); }
    else if (f.k === 'r') { const u = 1 - a; ctx.globalAlpha = a; ctx.strokeStyle = f.col; ctx.lineWidth = f.w * a + 1; ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r * (0.3 + 0.7 * u), f.r * (0.3 + 0.7 * u) * 0.55, 0, 0, TAU); ctx.stroke(); }
    else if (f.k === 'l') {
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const [wm, al, col] of [[2.4, 0.3, f.col], [1, 0.95, f.col]]) { ctx.globalAlpha = a * al; ctx.strokeStyle = col; ctx.lineWidth = f.w * wm; ctx.beginPath(); f.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke(); }
    }
  }
  norm();
  // pass 3: overlays and text
  for (const f of fx) {
    const a = Math.max(0, f.life / f.max);
    if (f.k === 'flash') { ctx.globalAlpha = a; ctx.fillStyle = f.col; ctx.fillRect(0, 0, W, H); }
    else if (f.k === 'emote') {
      const p = catPos(f.uid), age = f.max - f.life, sc = 1 + Math.max(0, 0.6 * (1 - age / 0.15));
      ctx.globalAlpha = Math.min(1, a * 3); ctx.drawImage(iconSprite(f.glyph), p.x + 22 - 13 * sc, p.y - 52 - age * 16 - 13 * sc, 26 * sc, 26 * sc);
    }
    else if (f.k === 't') {
      const age = f.max - f.life, sc = f.pop ? 1 + Math.max(0, 0.7 * (1 - age / 0.14)) : 1;
      ctx.globalAlpha = Math.min(1, a * 2.2); ctx.font = `800 ${Math.round(f.size * sc)}px ${FONT}`; ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = '#271c33'; ctx.lineJoin = 'round';
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
  const n = 8, sh = img.height / n, dsh = dh / n;
  for (let k = 0; k < n; k++) {
    const u = k / (n - 1), off = Math.sin(t * 2.4 + phase + (1 - u) * 2.2) * amp * (1 - u) * (1 - u * 0.4);
    ctx.drawImage(img, 0, k * sh, img.width, sh + 0.6, dx + off, dy + k * dsh, dw, dsh + 0.7);
  }
}
function shadow(x, y, rx) { ctx.fillStyle = 'rgba(30,20,50,.22)'; ctx.beginPath(); ctx.ellipse(x, y, rx, rx * 0.22, 0, 0, TAU); ctx.fill(); }

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
    const below = list[i - 1], bump = below && below.atk > 0 ? Math.sin((below.atk / 0.22) * Math.PI) * 3.5 : 0;
    const feetY = GROUND - i * SLOT - hop - bump;
    const atk = c.atk > 0 ? c.atk / 0.22 : 0;
    const lunge = atk * 7;
    const sway = i * (marching ? Math.sin(t * 9) * 1.5 : Math.sin(t * 1.7 + 0.5) * 0.9) + towerWob * Math.sin(t * 32) * i * 1.6;
    const mood = moods.get(c.uid) || 0;
    const variant = c.flash > 0 ? 'hurt' : mood > 0 || cheer ? 'happy' : (cheer ? 'blink' : ((t * 0.9 + i * 1.37 + (c.seed || 0)) % 4.3 < 0.13 ? 'blink' : 'open'));
    const spr = catSprite(c.id, variant);
    if (i === 0) shadow(cx, GROUND + 3, 46);
    castShadow('cat:' + c.id, catSprite(c.id), cx + lunge * 0.3, GROUND + 2, -60 * sc, feetY - GROUND - 107 * sc, 120 * sc, 120 * sc, 0.30 - i * 0.03);
    if (c.lvl >= 2) { add(); glow(cx + sway, feetY - 44, 58 + c.lvl * 8, c.lvl === 3 ? '#ffd24a' : '#ffe38c', (c.lvl === 3 ? 0.5 : 0.32) + 0.08 * Math.sin(t * 3 + i)); norm(); }
    const squash = c.flash > 0 ? 0.06 : 0;
    for (let k = zoomies ? 2 : 0; k >= 0; k--) {
      ctx.save();
      ctx.translate(cx + lunge + sway - k * 16, feetY);
      ctx.scale(1 + atk * 0.05 + squash, 1 - atk * 0.06 - squash);
      ctx.rotate(Math.sin(t * 2 + i * 1.3) * 0.015 + (marching ? Math.sin(t * 9 + i) * 0.03 : 0) + sway * 0.002);
      ctx.globalAlpha = k ? 0.22 / k : 1;
      if (gfx >= 2 && !k) drawJelly(spr, -60 * sc, -107 * sc, 120 * sc, 120 * sc, t, 0.9 + atk * 2.2 + (marching ? 1.6 : 0) + towerWob * 2.5, i * 1.3 + (c.seed || 0));
      else ctx.drawImage(spr, -60 * sc, -107 * sc, 120 * sc, 120 * sc);
      if (!k && c.flash > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(0.8, c.flash * 4); ctx.drawImage(spr, -60 * sc, -107 * sc, 120 * sc, 120 * sc); }
      ctx.restore();
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    if (c.lvl === 3) { ctx.fillStyle = '#fff6b0'; for (let k = 0; k < 3; k++) { const an = t * 2 + k * 2.1; ctx.beginPath(); ctx.arc(cx + sway + Math.cos(an) * 40, feetY - 44 + Math.sin(an) * 26, 2.4, 0, TAU); ctx.fill(); } }
    if (hpBars) {
      const bx = cx - 142, by = feetY - 50, bw = 80;
      ctx.font = `800 12px ${FONT}`; ctx.textAlign = 'left'; ctx.lineWidth = 3.5; ctx.strokeStyle = '#271c33'; ctx.lineJoin = 'round'; ctx.strokeText(d.name, bx, by - 3); ctx.fillStyle = '#fff'; ctx.fillText(d.name, bx, by - 3);
      if (c.lvl > 1) { const nw = ctx.measureText(d.name).width + 3; ctx.strokeText('★'.repeat(c.lvl), bx + nw, by - 3); ctx.fillStyle = '#ffd23f'; ctx.fillText('★'.repeat(c.lvl), bx + nw, by - 3); }
      ctx.fillStyle = 'rgba(39,28,51,.8)'; ctx.beginPath(); ctx.roundRect(bx - 1, by, bw + 2, 9, 5); ctx.fill();
      const r = Math.min(1, Math.max(0, c.hp / c.max));
      const cb = save.opt.colorblind;
      ctx.fillStyle = r > 0.5 ? (cb ? '#4aa8ff' : '#5fe08a') : r > 0.25 ? '#ffc94a' : (Math.sin(t * 14) > 0 ? (cb ? '#ff8a2a' : '#ff6b6b') : '#ffd9b0');
      ctx.beginPath(); ctx.roundRect(bx, by + 1, Math.max(3, bw * r), 7, 4); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.roundRect(bx + 1, by + 1.5, Math.max(2, bw * r - 2), 2, 1); ctx.fill();
      if (c.items) c.items.forEach((id, k) => ctx.drawImage(iconSprite(ITEM_BY_ID[id].icon), bx + k * 17, by + 11, 16, 16));
    }
  });
}

function drawEnemy(e, t) {
  if (e.dead) return;
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
    ctx.save(); ctx.translate(-spr.ax, -spr.ay); nestOverlay(ctx, e.hp / e.maxHp, t); ctx.restore();
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
  if (e.slowT > 0 && e.slow > 0 && !e.boss) { add(); glow(e.x, y - e.h * 0.5, e.w * 0.9, '#8fd3ff', 0.4); norm(); }
  if (e.burn) { add(); glow(e.x + Math.sin(t * 20) * 3, y - e.h * 0.6, e.w * 0.6, '#ff7a2b', 0.5); norm(); }
  if (e.stun > 0 && !e.boss) { ctx.fillStyle = '#ffe14d'; for (let k = 0; k < 3; k++) { const an = t * 6 + k * 2.1; ctx.beginPath(); ctx.arc(e.x + Math.cos(an) * 10, top + Math.sin(an) * 3, 2.2, 0, TAU); ctx.fill(); } }
  if (e.poison) { ctx.fillStyle = '#8be05a'; ctx.beginPath(); ctx.arc(e.x + 12, y - e.h * 0.9 + Math.sin(t * 6) * 2, 3, 0, TAU); ctx.fill(); }
  if (e.hp < e.maxHp && !e.boss) {
    const w = Math.max(26, e.w) * 0.9, by = top - 6;
    ctx.fillStyle = 'rgba(39,28,51,.8)'; ctx.beginPath(); ctx.roundRect(e.x - w / 2 - 1, by, w + 2, 6, 3); ctx.fill();
    ctx.fillStyle = e.elite ? '#ffd23f' : '#ff7a8a'; ctx.beginPath(); ctx.roundRect(e.x - w / 2, by + 1, Math.max(2, w * e.hp / e.maxHp), 4, 2); ctx.fill();
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
  const list = alive.map((c) => ({ id: c.id, lvl: c.lvl, hp: c.hp, max: S.catMaxHp(g, c), flash: c.flash, atk: c.atk, seed: c.uid * 0.7, items: c.items, uid: c.uid }));
  const marching = g.marching && g.state === 'fight';
  drawStack(g.towerX, list, t, marching, true, mode === 'celebrate', g.zoomT > 0);
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
  const list = titleStack.map((id, i) => ({ id, lvl: i === 0 ? 2 : 1, hp: 1, max: 1, flash: 0, atk: Math.max(0, Math.sin(t * 3 + i) - 0.8), seed: i * 0.9 }));
  drawStack(cx, list, t, true, false, false, false);
  for (let i = 0; i < 5; i++) {
    const x = ((i * 190 - t * 60) % 1000 + 1000) % 1000 + 330;
    const type = ['mouse', 'scout', 'slinger', 'armored', 'mouse'][i];
    const spr = enemySprite(type, false);
    const y = GROUND + 8 + (i % 3) * 9;
    shadow(x, y, 18);
    ctx.save(); ctx.translate(x, y - Math.abs(Math.sin(t * 9 + i)) * 3); ctx.drawImage(spr.c, -spr.ax, -spr.ay, spr.w, spr.h); ctx.restore();
  }
}

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

function drawCombo(t) {
  if (combo < 3 || mode !== 'play') return;
  const s = 1 + comboPulse * 0.35, fade = Math.min(1, comboT * 2);
  ctx.save(); ctx.translate(18, 176); ctx.scale(s, s); ctx.globalAlpha = fade;
  ctx.font = `800 ${24 + Math.min(14, combo / 4)}px ${FONT}`; ctx.textAlign = 'left'; ctx.lineWidth = 5; ctx.strokeStyle = '#271c33'; ctx.lineJoin = 'round';
  const col = combo >= 50 ? '#ff8fb7' : combo >= 20 ? '#ffd23f' : '#ffffff';
  ctx.strokeText(`x${combo}`, 0, 0); ctx.fillStyle = col; ctx.fillText(`x${combo}`, 0, 0);
  ctx.font = `800 13px ${FONT}`; ctx.lineWidth = 3.5; ctx.strokeText('COMBO', 2, 15); ctx.fillStyle = '#ffe3c4'; ctx.fillText('COMBO', 2, 15);
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
      L.push({ x: p.x, y: p.y, r: p.kind === 'enemy' ? 44 : 78, col, a: 0.9 });
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
function drawWeather(t, dt) {
  const th = THEMES[bdIdx] || THEMES[0];
  if (th.weather === 'rain') {
    ctx.save(); ctx.strokeStyle = 'rgba(190,210,255,.42)'; ctx.lineWidth = 1.2; ctx.beginPath();
    for (const d of drops) {
      d.y += d.v * dt; d.x -= d.v * dt * 0.18;
      if (d.y > H) { if (Math.random() < 0.5 && d.y < H + 40) { /* splash handled below */ } d.y = -20; d.x = Math.random() * (W + 200); }
      ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + d.l * 0.18, d.y - d.l);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(200,220,255,.5)';
    for (let i = 0; i < 6; i++) { const x = (i * 197 + t * 330) % W, y = GROUND + 6 + ((i * 53) % 40), r = 3 + ((t * 9 + i) % 1) * 7; ctx.globalAlpha = 0.5 * (1 - (r - 3) / 7); ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.3, 0, 0, TAU); ctx.fill(); }
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
  if (sk > 0.2) ctx.translate((Math.random() - 0.5) * sk, (Math.random() - 0.5) * sk);
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
  drawFx();
  if (gfx >= 2) drawWeather(t, dt);
  ctx.restore();
  if (gfx >= 3) {
    // glow reads best in dim light, so it is gentle at noon and stronger at dusk, at night and in the rain
    const lum = (parseInt(ambCur.slice(1, 3), 16) + parseInt(ambCur.slice(3, 5), 16) + parseInt(ambCur.slice(5, 7), 16)) / 765;
    post.bloom(ctx, cv, (post.hasFilter ? 0.5 : 0.2) * (1.25 - lum));
  }
  if (gfx >= 3 && th.deco !== 'star') post.flare(ctx, 740, 120, 0.08);
  if (gfx >= 3) post.grain(ctx, t, 0.045);
  vignette(t);
  drawCombo(t);
}

// ---------------------------------------------------------------- input
function togglePause() { if (mode !== 'play') return; if (paused) { paused = false; closeScreen(); } else showPause(); }
function doZoomies() { if (mode === 'play' && !paused && S.useZoomies(g)) drain(); }
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
  $('bFull').addEventListener('click', () => { sfx.unlock(); toggleFull(); });
  const syncFull = () => $('bFull').classList.toggle('on', isFull());
  document.addEventListener('fullscreenchange', () => { syncFull(); fit(); });
  document.addEventListener('webkitfullscreenchange', () => { syncFull(); fit(); });
}
function toggleSpeed() { speed = speed === 1 ? 2 : 1; $('bSpeed').textContent = 'x' + speed; }
$('bPause').addEventListener('click', () => { sfx.unlock(); togglePause(); });
$('bSpeed').addEventListener('click', () => { sfx.unlock(); toggleSpeed(); });
$('bSound').addEventListener('click', () => { sfx.unlock(); save.sound = !save.sound; sfx.on = save.sound; persist(); toast(save.sound ? 'Sound on' : 'Sound off'); });
$('zoom').addEventListener('click', () => { sfx.unlock(); doZoomies(); });
$('bMeter').addEventListener('click', () => { sfx.unlock(); save.meter = !save.meter; persist(); meterT = 0; });
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  if (k === ' ') { e.preventDefault(); doZoomies(); }
  else if (k === 'p' || k === 'escape') togglePause();
  else if (k === 'f') toggleSpeed();
  else if (k === 'g' && !$('bFull').hidden) toggleFull();
  else if (k === 'd') { save.meter = !save.meter; persist(); meterT = 0; }
  else if (k === 'm') { save.sound = !save.sound; sfx.on = save.sound; persist(); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'play' && !paused) showPause(); });
addEventListener('pagehide', () => { if (g && mode !== 'over' && g.wave > 1) commitRun(); });

// ---------------------------------------------------------------- main loop
let frameEma = 16, slowFrames = 0;
function frame(ts) {
  const raw = (ts - last) / 1000;
  const dt = Math.min(0.05, raw);
  last = ts;
  tAnim += dt;
  // drop render resolution if the device cannot keep up
  frameEma = frameEma * 0.95 + Math.min(100, raw * 1000) * 0.05;
  if (save.opt.quality === 'auto' && frameEma > 26 && (gfx > 1 || res > 1.01)) {
    if (++slowFrames > 90) { slowFrames = 0; if (gfx > 1) gfx--; else { quality *= 0.78; fit(); } }
  } else slowFrames = 0;
  if (slowT > 0) { slowT -= dt; if (slowT <= 0) slowT = 0; } else timeScale += (1 - timeScale) * Math.min(1, dt * 5);
  if (comboT > 0) { comboT -= dt; if (comboT <= 0) combo = 0; }
  comboPulse *= Math.exp(-8 * dt); towerWob *= Math.exp(-5 * dt);
  for (const [k, v] of moods) { if (v - dt <= 0) moods.delete(k); else moods.set(k, v - dt); }
  sfx.setIntensity(Math.min(1, combo / 30));
  if (g && mode === 'play' && !paused) {
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
    updateFx(paused ? 0 : dt);
  }
  render(dt);
  updateHud(dt);
  requestAnimationFrame(frame);
}

window.stackingCats = { get g() { return g; }, get mode() { return mode; }, S, save: () => save, hideCoach, startRun, toast, get res() { return res; }, get fxCount() { return fx.length; }, showTower, showItemReward };
showTitle();
requestAnimationFrame(frame);
void ENEMY_TYPES;

// Stacking Cats: renderer, effects, HUD and screens. The rules live in sim.js.
import {
  CATS, CAT_BY_ID, SNACK_BY_ID, THEMES, STARTERS, START_CATS, MAX_STACK, MAX_BENCH, BOSS_EVERY, ENEMY_TYPES,
  emptyStats, checkUnlocks, mergeRun, unlockProgress,
} from './cats.js';
import * as S from './sim.js';
import { drawCat } from './art_cats.js';
import { enemySprite, nestSprite, nestOverlay, makeBackdrop, drawBackdrop } from './art_world.js';
import { Sfx } from './audio.js';

const SAVE_KEY = 'stacking_cats_save_v1';
const W = S.W, H = S.H, GROUND = S.GROUND, SLOT = S.SLOT;
const FONT = '"Baloo 2","Nunito","Arial Rounded MT Bold","Trebuchet MS",system-ui,sans-serif';
const $ = (id) => document.getElementById(id);
const app = $('app'), cv = $('cv'), ctx = cv.getContext('2d'), screenEl = $('screen');
const sfx = new Sfx();

// ---------------------------------------------------------------- save
function freshSave() { return { v: 1, stats: emptyStats(), unlocked: [...STARTERS], sound: true, music: true, tips: {} }; }
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && s.stats && Array.isArray(s.unlocked)) {
      const f = freshSave();
      return { ...f, ...s, stats: { ...f.stats, ...s.stats, lvl3Of: { ...(s.stats.lvl3Of || {}) } }, unlocked: [...new Set([...STARTERS, ...s.unlocked.filter((id) => CAT_BY_ID[id])])], tips: s.tips || {} };
    }
  } catch (e) { /* private mode or damaged save: start fresh */ }
  return freshSave();
}
let save = loadSave();
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } }
sfx.on = save.sound; sfx.musicOn = save.music;

// ---------------------------------------------------------------- layout
function fit() {
  const k = Math.min(innerWidth / W, innerHeight / H);
  app.style.transform = `scale(${k})`;
  app.style.left = (innerWidth - W * k) / 2 + 'px';
  app.style.top = (innerHeight - H * k) / 2 + 'px';
}
addEventListener('resize', fit); fit();

// ---------------------------------------------------------------- sprites
const catSprites = new Map(), silSprites = new Map();
function catSprite(id) {
  let c = catSprites.get(id);
  if (!c) {
    c = document.createElement('canvas'); c.width = c.height = 240;
    const x = c.getContext('2d'); x.scale(2, 2); drawCat(x, CAT_BY_ID[id]);
    catSprites.set(id, c);
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
  if (!backdrops.has(idx)) backdrops.set(idx, makeBackdrop(THEMES[idx], idx));
  bd = backdrops.get(idx); bdIdx = idx;
}

// ---------------------------------------------------------------- screens (DOM)
function setScreen(html, cls = '') {
  screenEl.innerHTML = html ? `<div class="screen ${cls}">${html}</div>` : '';
  paintThumbs(screenEl);
}
const closeScreen = () => setScreen('');
screenEl.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  sfx.unlock();
  const fn = acts[t.dataset.act];
  if (fn) { sfx.play('ui'); fn(t.dataset, t); }
});

const stars = (n) => '★'.repeat(n);
const owns = (id) => g && [...g.cats, ...g.bench].some((c) => c.id === id && c.lvl === 1);
function catCard(id, o = {}) {
  const d = CAT_BY_ID[id];
  return `<div class="card" data-act="${o.act || 'pickCat'}" data-id="${id}">${o.ribbon ? `<div class="ribbon">${o.ribbon}</div>` : ''}<canvas width="128" height="128" data-cat="${id}"></canvas><h3>${d.name}</h3><div class="ttl">${d.title}</div><div class="role">${d.role}</div><p>${d.desc}</p></div>`;
}
function snackCard(id) {
  const s = SNACK_BY_ID[id];
  const kind = { perm: 'Whole run', temp: '3 waves', instant: 'Right now' }[s.kind];
  return `<div class="card snack" data-act="pickSnack" data-id="${id}"><div class="ic">${s.icon}</div><h3>${s.name}</h3><div class="kind k-${s.kind}">${kind}</div><p>${s.desc}</p></div>`;
}

function showTitle() {
  mode = 'title'; paused = false;
  const total = save.stats;
  setScreen(`
    <h1 class="logo">Stacking<span>Cats</span></h1>
    <div class="tag">Stack your cats. Merge them. Smash the mouse nests.</div>
    <div class="row"><button class="btn big" data-act="play">Play</button></div>
    <div class="row"><button class="btn" data-act="dex">Cat Dex ${save.unlocked.length}/${CATS.length}</button><button class="btn grey" data-act="how">How to play</button><button class="btn grey" data-act="sound">Sound: ${save.sound ? 'On' : 'Off'}</button></div>
    <div class="hint">${total.runs ? `Best wave ${total.bestWave} &middot; ${total.kills} mice defeated &middot; ${total.bossKills} nests destroyed` : 'Tap Play to begin'}</div>`, 'clear');
  acts = {
    play: startRun, dex: () => showDex(showTitle), how: () => showHow(showTitle),
    sound: () => { save.sound = !save.sound; sfx.on = save.sound; persist(); showTitle(); },
  };
  setBackdrop(0);
  sfx.music('calm');
}

function showHow(back) {
  setScreen(`<h2>How to play</h2><ul class="how">
    <li><b>Your stack fights by itself.</b> Cats walk right and attack. Mice come from the right.</li>
    <li><b>Order matters.</b> Mice bite the bottom cat first. Put tough cats low. Higher cats see farther.</li>
    <li><b>Every wave</b> you pick a snack. <b>Every ${BOSS_EVERY}th wave</b> is a nest fight: destroy it to rescue a new cat.</li>
    <li><b>Merge</b> two equal cats (same type and level) into one stronger cat, up to Lv 3. The tower fits ${MAX_STACK}, the bench fits ${MAX_BENCH}.</li>
    <li><b>Zoomies</b> (Space): fill the meter by fighting, then make everyone much faster for 6 seconds.</li>
    <li><b>Snacks</b> last the whole run, 3 waves, or heal at once. Mice get stronger every wave. Good luck!</li></ul>
    <div class="row"><button class="btn" data-act="back">Got it</button></div>`);
  acts = { back };
}

function showDex(back) {
  const un = new Set(save.unlocked);
  let sel = null;
  const draw = () => {
    setScreen(`<h2>Cat Dex</h2><div class="dex">${CATS.map((d) => {
      const u = un.has(d.id), p = unlockProgress(d, save.stats);
      return `<div class="tile ${u ? '' : 'locked'} ${sel === d.id ? 'sel' : ''}" data-act="tile" data-id="${d.id}"><canvas width="96" height="96" data-cat="${d.id}" ${u ? '' : 'data-lock="1"'}></canvas><b>${u ? d.name : '???'}</b>${u ? `<small>${d.role}</small>` : `<small>${p.need > 1 ? `${p.have}/${p.need}` : p.have ? 'Done' : 'Locked'}</small>`}</div>`;
    }).join('')}</div>
    <div class="detail">${sel ? dexDetail(sel, un.has(sel)) : 'Tap a cat to see how to unlock it. Locked cats join the picks once you earn them.'}</div>
    <div class="row"><button class="btn" data-act="back">Back</button></div>`);
  };
  draw();
  acts = { back, tile: (d) => { sel = d.id; draw(); } };
}
function dexDetail(id, unlocked) {
  const d = CAT_BY_ID[id];
  if (unlocked) return `<b>${d.name}, ${d.title}</b> (${d.role}). ${d.desc}`;
  const p = unlockProgress(d, save.stats);
  return `<b>Locked.</b> To unlock: ${d.unlock.text}${p.need > 1 ? ` (${p.have}/${p.need})` : ''}.<div class="pbar"><i style="width:${(100 * p.have) / p.need}%"></i></div>`;
}

// ---------------------------------------------------------------- run flow
function startRun() {
  sfx.unlock();
  g = S.newGame({ seed: (Math.random() * 2147483647) | 0, unlocked: [...save.unlocked] });
  runCommitted = false; pickN = 0; fx.length = 0; speed = 1; paused = false;
  $('bSpeed').textContent = 'x1';
  showPickStart();
}

function showPickStart() {
  mode = 'pick';
  const ch = S.rollCatChoices(g);
  setScreen(`<h2>Choose friend ${pickN + 1} of ${START_CATS}</h2><p class="sub">${pickN === 0 ? 'Every cat attacks differently. Pick the first one for your tower.' : 'Pick a friend to stack on top. Choosing the same cat again merges them!'}</p>
    <div class="cards">${ch.map((id) => catCard(id, { ribbon: owns(id) ? 'MERGE!' : '' })).join('')}</div>`);
  acts = {
    pickCat: (d) => {
      const r = S.addCat(g, d.id);
      sfx.play(r.merged ? 'merge' : 'pick');
      pickN++;
      if (pickN < START_CATS) showPickStart(); else beginWave();
    },
  };
}

function beginWave() {
  closeScreen();
  S.startWave(g);
  mode = 'play';
  setBackdrop(themeFor(g.wave));
  const boss = g.bossWave;
  const nest = g.enemies.find((e) => e.boss);
  banner(boss ? 'NEST BATTLE!' : `Wave ${g.wave}`, boss ? nest.name : `${THEMES[bdIdx].name}`, boss);
  sfx.play(boss ? 'boss' : 'wave');
  sfx.music(boss ? 'boss' : 'fight');
  if (g.wave === 1 && !save.tips.first) { save.tips.first = true; persist(); toast('Tip: the bottom cat takes the hits, so stack tough cats low'); }
  if (g.wave === 2 && !save.tips.zoom) { save.tips.zoom = true; persist(); toast('Tip: fill the Zoomies meter, then press Space or tap it'); }
}

function onClear() {
  mode = 'reward';
  sfx.play(g.bossWave ? 'win' : 'clear');
  sfx.music('calm');
  queue = g.reward.slice();
  nextReward();
}
function nextReward() {
  const r = queue.shift();
  rewardChoices = null;
  if (!r) { beginWave(); return; }
  if (r === 'cat') showCatReward(); else showSnackReward();
}

function showCatReward() {
  rewardChoices = rewardChoices || S.rollCatChoices(g);
  const nest = THEMES[bdIdx].name;
  setScreen(`<h2>Nest destroyed!</h2><p class="sub">A caged cat is free and wants to join your stack. Who is it?</p>
    <div class="cards">${rewardChoices.map((id) => catCard(id, { ribbon: owns(id) ? 'MERGE!' : '' })).join('')}</div>
    <div class="row hint"><button class="btn small grey" data-act="tower">Arrange tower</button></div>`);
  acts = {
    pickCat: (d) => {
      const r = S.addCat(g, d.id);
      if (!r.ok) { showFull(d.id); return; }
      sfx.play(r.merged ? 'merge' : 'pick');
      toast(r.merged ? `${CAT_BY_ID[d.id].name} merged to Lv ${r.cat.lvl}!` : `${CAT_BY_ID[d.id].name} joined${r.benched ? ' the bench' : ' the stack'}!`);
      nextReward();
    },
    tower: () => showTower(showCatReward),
  };
  void nest;
}

// tower and bench are full: the new cat replaces one of the others (or is skipped)
function showFull(newId) {
  const list = [...g.cats, ...g.bench];
  setScreen(`<h2>No room!</h2><p class="sub">Your tower and bench are full. Who steps down so ${CAT_BY_ID[newId].name} can join?</p>
    <div class="row">${list.map((c) => `<div class="slot has bench-slot" data-act="rel" data-uid="${c.uid}" style="width:200px"><canvas width="104" height="104" data-cat="${c.id}"></canvas><div><b>${CAT_BY_ID[c.id].name}</b><small>Lv ${c.lvl}</small></div></div>`).join('')}</div>
    <div class="row"><button class="btn grey" data-act="skip">Keep my team, skip</button></div>`);
  acts = {
    rel: (d) => { S.releaseCat(g, +d.uid); S.addCat(g, newId); sfx.play('pick'); nextReward(); },
    skip: () => nextReward(),
  };
}

function showSnackReward() {
  rewardChoices = rewardChoices || S.rollSnackChoices(g);
  setScreen(`<h2>Wave ${g.wave} cleared!</h2><p class="sub">Snack time. Pick one treat for your cats.</p>
    <div class="cards">${rewardChoices.map(snackCard).join('')}</div>
    <div class="row hint"><button class="btn small grey" data-act="tower">Arrange tower</button></div>`);
  acts = {
    pickSnack: (d) => {
      S.eatSnack(g, d.id);
      sfx.play('pick');
      toast(`${SNACK_BY_ID[d.id].icon} ${SNACK_BY_ID[d.id].name}!`);
      nextReward();
    },
    tower: () => showTower(showSnackReward),
  };
}

// arrange tower: tap a cat, then tap another cat to swap, merge equal ones, or tap an empty slot to move
function showTower(back) {
  let sel = null, rel = false;
  const catRow = (c, zone, i, extra = '') => {
    const d = CAT_BY_ID[c.id], mx = S.catMaxHp(g, c);
    const canMerge = sel && sel !== c.uid && (() => { const a = S.findCat(g, sel); return a && a.id === c.id && a.lvl === c.lvl && a.lvl < 3; })();
    return `<div class="slot has ${sel === c.uid ? 'sel' : ''} ${canMerge ? 'can' : ''}" data-act="slot" data-zone="${zone}" data-i="${i}"><canvas width="104" height="104" data-cat="${c.id}"></canvas><div><b>${d.name}</b><small>${d.role}${canMerge ? ' - tap to MERGE' : ''}</small><div class="hp"><i style="width:${Math.max(2, 100 * c.hp / mx)}%"></i></div></div><span class="lv">${stars(c.lvl)}</span>${extra}</div>`;
  };
  const draw = () => {
    const tw = [];
    for (let i = MAX_STACK - 1; i >= 0; i--) tw.push(g.cats[i] ? catRow(g.cats[i], 'tower', i, i === 0 ? '<span class="base">takes the hits</span>' : '') : `<div class="slot" data-act="slot" data-zone="tower" data-i="${i}">&nbsp;Empty spot</div>`);
    const bn = [];
    for (let i = 0; i < MAX_BENCH; i++) bn.push(g.bench[i] ? catRow(g.bench[i], 'bench', i) : `<div class="slot bench-slot" data-act="slot" data-zone="bench" data-i="${i}">&nbsp;Empty bench spot</div>`);
    setScreen(`<h2>Arrange your tower</h2><p class="sub">Tap a cat, then another to swap. Two equal cats merge into one stronger cat!</p>
      <div class="tower"><div class="col"><h4>Tower (top to bottom)</h4>${tw.join('')}</div><div class="col" style="width:250px"><h4>Bench (rests, heals fast)</h4>${bn.join('')}
        <div class="row" style="margin-top:6px"><button class="btn small grey" data-act="release" ${sel ? '' : 'disabled'}>${rel ? 'Really release?' : 'Release cat'}</button></div></div></div>
      <div class="row"><button class="btn" data-act="done">Done</button></div>`);
  };
  draw();
  acts = {
    done: back,
    release: () => {
      if (!sel) return;
      if (!rel) { rel = true; draw(); return; }
      if (g.cats.length + g.bench.length > 1) { S.releaseCat(g, sel); sel = null; }
      rel = false; if (!g.cats.length && g.bench.length) S.moveCat(g, g.bench[0].uid, 'tower'); draw();
    },
    slot: (d) => {
      rel = false;
      const zone = d.zone, i = +d.i, list = zone === 'tower' ? g.cats : g.bench, cat = list[i];
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
      draw();
    },
  };
}

function commitRun() {
  if (runCommitted || !g) return [];
  runCommitted = true;
  save.stats = mergeRun(save.stats, g.run);
  const fresh = checkUnlocks(save.stats, new Set(save.unlocked));
  save.unlocked.push(...fresh);
  persist();
  return fresh;
}

function onOver() {
  mode = 'over';
  sfx.play('over'); sfx.music('calm');
  showOver(commitRun());
}
function showOver(fresh) {
  const r = g.run, best = save.stats.bestWave;
  setScreen(`<h2>The stack has fallen</h2><p class="sub">${r.wave >= best && r.wave > 1 ? 'A new personal best!' : 'The mice cheer. Next time you will get them.'}</p>
    <div class="stats"><div><b>${r.wave}</b>Wave reached</div><div><b>${r.kills}</b>Mice defeated</div><div><b>${r.bossKills}</b>Nests destroyed</div><div><b>${r.merges}</b>Merges</div></div>
    ${fresh.length ? `<p class="sub">New friends unlocked!</p><div class="newcats">${fresh.map((id) => catCard(id, { act: 'none' })).join('')}</div>` : ''}
    <div class="row"><button class="btn big" data-act="again">Try again</button><button class="btn grey" data-act="title">Title</button><button class="btn grey" data-act="dex">Cat Dex</button></div>`);
  acts = { again: startRun, title: () => { g = null; showTitle(); }, dex: () => showDex(() => showOver(fresh)), none: () => {} };
}

function showPause() {
  paused = true;
  setScreen(`<h2 class="paused">Paused</h2><div class="row"><button class="btn big" data-act="resume">Resume</button></div><div class="row"><button class="btn grey" data-act="how">How to play</button><button class="btn grey" data-act="quit">Give up</button></div>`);
  acts = {
    resume: () => { paused = false; closeScreen(); },
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
function updateHud() {
  const show = g && (mode === 'play' || mode === 'reward');
  $('hud').style.display = g && mode !== 'title' && mode !== 'pick' && mode !== 'over' ? 'block' : 'none';
  if (!show) return;
  const playing = mode === 'play';
  setText('waveTxt', `Wave ${g.wave}`);
  setText('themeTxt', THEMES[bdIdx] ? THEMES[bdIdx].name : '');
  const inStage = ((g.wave - 1) % BOSS_EVERY) + 1;
  setText('nestPips', Array.from({ length: BOSS_EVERY }, (_, i) => `<i class="${i === BOSS_EVERY - 1 ? 'boss' : ''} ${i + 1 <= inStage ? 'on' : ''}"></i>`).join(''));
  const nest = g.enemies.find((e) => e.boss && !e.dead);
  $('bossBar').style.display = playing && nest ? 'block' : 'none';
  if (nest) { setText('bossName', nest.name); $('bossHp').style.width = Math.max(0, 100 * nest.hp / nest.maxHp) + '%'; }
  const zr = g.zoomT > 0;
  const z = $('zoom');
  z.style.display = playing ? 'flex' : 'none';
  z.style.setProperty('--p', (zr ? 100 * g.zoomT / 6 : g.zoom) + '%');
  z.className = zr ? 'on' : g.zoom >= 100 ? 'ready' : '';
  setText('zoomSub', zr ? 'GO!' : g.zoom >= 100 ? 'READY' : Math.floor(g.zoom) + '%');
  const counts = {};
  for (const id of g.perm) counts[id] = (counts[id] || 0) + 1;
  const chips = Object.entries(counts).map(([id, n]) => `<span class="chip" title="${SNACK_BY_ID[id].desc}">${SNACK_BY_ID[id].icon}${n > 1 ? ' x' + n : ''}</span>`)
    .concat(g.temp.map((t) => `<span class="chip temp" title="${SNACK_BY_ID[t.id].desc}">${SNACK_BY_ID[t.id].icon} ${t.left}w</span>`));
  setText('snackBar', chips.join(''));
  $('snackBar').style.display = chips.length ? 'flex' : 'none';
}

// ---------------------------------------------------------------- effects
function puff(x, y, n, col, sp = 90, life = 0.5, r = 4, grav = 120) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = sp * (0.3 + Math.random() * 0.7);
    fx.push({ k: 'p', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - sp * 0.3, life, max: life, r: r * (0.5 + Math.random() * 0.7), col, grav });
  }
}
const txtFx = (x, y, t, col = '#fff', size = 15, life = 0.8) => { if (fx.length < 260) fx.push({ k: 't', x: x + (Math.random() - 0.5) * 14, y, t, col, size, life, max: life }); };
const ring = (x, y, r, col, life = 0.35, w = 4) => fx.push({ k: 'r', x, y, r, col, life, max: life, w });
const bolt = (pts, col, w, life = 0.16) => fx.push({ k: 'l', pts, col, w, life, max: life });

function catPos(uid) {
  const alive = S.aliveCats(g);
  const i = alive.findIndex((c) => c.uid === uid);
  return i < 0 ? { x: g.towerX, y: GROUND - 50 } : { x: g.towerX, y: GROUND - 50 - i * SLOT };
}

function handle(e) {
  switch (e.k) {
    case 'dmg': if (e.v >= 1) txtFx(e.x, e.y, Math.round(e.v), e.crit ? '#ffe14d' : '#ffffff', e.crit ? 22 : 14, e.crit ? 0.95 : 0.65); break;
    case 'kill':
      if (e.quiet) { puff(e.x, e.y, 3, '#ffffff', 60, 0.4); break; }
      puff(e.x, e.y, e.elite ? 14 : 7, e.elite ? '#ffd23f' : '#ffffff', 110, 0.5, 4);
      fx.push({ k: 's', x: e.x, y: e.y - 6, life: 0.4, max: 0.4 });
      sfx.play('pop'); break;
    case 'swipe':
      fx.push({ k: 'a', x: e.x, y: e.y, wide: e.wide, life: 0.2, max: 0.2 });
      sfx.play('swipe'); break;
    case 'flame': for (let i = 0; i < 7; i++) fx.push({ k: 'f', x: e.x + Math.random() * e.len, y: e.y + (Math.random() - 0.5) * (6 + i * 3), vy: -30 - Math.random() * 30, r: 5 + Math.random() * 7, life: 0.35, max: 0.35 }); sfx.play('flame'); break;
    case 'chain': {
      const pts = [];
      for (let i = 0; i < e.pts.length - 1; i++) {
        const a = e.pts[i], b = e.pts[i + 1], n = 5;
        for (let j = 0; j < n; j++) pts.push({ x: a.x + (b.x - a.x) * j / n + (j ? (Math.random() - 0.5) * 12 : 0), y: a.y + (b.y - a.y) * j / n + (j ? (Math.random() - 0.5) * 12 : 0) });
      }
      pts.push(e.pts[e.pts.length - 1]);
      bolt(pts, '#bfe6ff', 3, 0.2);
      for (const p of e.pts.slice(1)) puff(p.x, p.y, 3, '#fff6a0', 70, 0.3, 3);
      sfx.play('zap'); break;
    }
    case 'beam': bolt([{ x: e.x, y: e.y }, { x: e.x2, y: e.y2 }], '#ff7be8', 7, 0.22); bolt([{ x: e.x, y: e.y }, { x: e.x2, y: e.y2 }], '#ffffff', 2.4, 0.22); sfx.play('zap'); break;
    case 'pellet': bolt([{ x: e.x, y: e.y }, { x: e.x2, y: e.y2 }], '#ffe9a0', 1.6, 0.1); puff(e.x2, e.y2, 1, '#ffe9a0', 40, 0.2, 2); break;
    case 'shoot':
      puff(e.x + 14, e.y, 3, '#fff6c0', 60, 0.18, 3);
      sfx.play(e.big ? 'bang' : 'shoot'); if (e.big) shake = Math.max(shake, 4); break;
    case 'boom':
      ring(e.x, e.y, e.r, e.color || '#ffb02e', 0.35, 5);
      puff(e.x, e.y, 10, e.color || '#ffb02e', 130, 0.45, 5);
      if (e.r > 60) shake = Math.max(shake, 5);
      sfx.play('boom'); break;
    case 'bolt': bolt([{ x: e.x + 10, y: -10 }, { x: e.x - 12, y: e.y * 0.35 }, { x: e.x + 8, y: e.y * 0.65 }, { x: e.x, y: e.y }], '#fff27a', 5, 0.25); fx.push({ k: 'flash', life: 0.1, max: 0.1, col: 'rgba(255,255,200,.35)' }); sfx.play('zap'); break;
    case 'star': bolt([{ x: e.x + 90, y: e.y - 160 }, { x: e.x, y: e.y }], '#ffe9a0', 4, 0.25); break;
    case 'nova': ring(e.x, e.y, e.r, '#bfeaff', 0.5, 10); ring(e.x, e.y, e.r * 0.7, '#ffffff', 0.4, 4); puff(e.x, e.y, 12, '#e8f8ff', 160, 0.5); sfx.play('zap'); break;
    case 'ko': { const p = catPos(e.uid); txtFx(p.x, p.y - 30, 'KO!', '#ff8a8a', 24, 1.2); puff(p.x, p.y, 10, '#ffd1e0', 100, 0.6); shake = Math.max(shake, 8); sfx.play('ko'); break; }
    case 'revive': { const p = catPos(e.uid); txtFx(p.x, p.y - 30, 'Back up!', '#fff6b0', 22, 1.2); puff(p.x, p.y, 12, '#fff6b0', 100, 0.7); sfx.play('heal'); break; }
    case 'heal': { const p = catPos(e.uid); txtFx(p.x - 40, p.y - 20, '+' + Math.round(e.v), '#7dffb0', 16, 0.9); break; }
    case 'healfx': puff(e.x, e.y - 20, 4, '#ff9ac6', 50, 0.7, 4, -20); sfx.play('heal'); break;
    case 'cathit': { const p = catPos(e.uid); txtFx(p.x - 50, p.y, Math.round(e.v), '#ff8a8a', 15, 0.7); sfx.play('hit'); break; }
    case 'dodge': { const p = catPos(e.uid); txtFx(p.x - 40, p.y, 'Miss!', '#b9f5ff', 16, 0.7); break; }
    case 'ehit': puff(e.x, e.y, 3, '#ffffff', 70, 0.25, 3); break;
    case 'spawn': puff(e.x, e.y - 10, 4, '#d9c9a0', 50, 0.4, 4); break;
    case 'roar': shake = Math.max(shake, 12); txtFx(e.x, e.y, 'SQUEAK!', '#ff9a9a', 30, 1.1); sfx.play('roar'); break;
    case 'bossDown': ring(e.x, e.y - 60, 160, '#fff6b0', 0.8, 12); puff(e.x, e.y - 60, 40, '#ffd23f', 260, 1, 7); puff(e.x, e.y - 60, 30, '#ffffff', 200, 0.9, 5); shake = 16; sfx.play('boom'); break;
    case 'zoom': banner('ZOOMIES!', '', false); sfx.play('zoom'); break;
    case 'nine': txtFx(S.TOWER_X + 40, 260, 'NINE LIVES!', '#ffd23f', 34, 1.6); puff(S.TOWER_X, 330, 30, '#ffd23f', 200, 0.9, 6); sfx.play('heal'); break;
    case 'merge': { const c = S.findCat(g, e.uid); if (c) puff(S.TOWER_X, 330, 20, '#ffd23f', 160, 0.7, 5); break; }
    default: break;
  }
}
function drain() { for (const e of g.ev) handle(e); g.ev.length = 0; }

function updateFx(dt) {
  for (const f of fx) {
    f.life -= dt;
    if (f.k === 'p') { f.vy += f.grav * dt; f.x += f.vx * dt; f.y += f.vy * dt; }
    else if (f.k === 't') f.y -= 36 * dt;
    else if (f.k === 'f') { f.y += f.vy * dt; f.r *= 0.97; }
  }
  for (let i = fx.length - 1; i >= 0; i--) if (fx[i].life <= 0) fx.splice(i, 1);
}
function drawFx() {
  for (const f of fx) {
    const a = Math.max(0, f.life / f.max);
    if (f.k === 'p') { ctx.globalAlpha = a; ctx.fillStyle = f.col; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.5 + a * 0.5), 0, 6.3); ctx.fill(); }
    else if (f.k === 'r') { const u = 1 - a; ctx.globalAlpha = a; ctx.strokeStyle = f.col; ctx.lineWidth = f.w * a + 1; ctx.beginPath(); ctx.ellipse(f.x, f.y, f.r * (0.3 + 0.7 * u), f.r * (0.3 + 0.7 * u) * 0.55, 0, 0, 6.3); ctx.stroke(); }
    else if (f.k === 'l') {
      ctx.globalAlpha = a; ctx.strokeStyle = f.col; ctx.lineWidth = f.w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.shadowColor = f.col; ctx.shadowBlur = 10;
      ctx.beginPath(); f.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke(); ctx.shadowBlur = 0;
    } else if (f.k === 'a') {
      ctx.globalAlpha = a; ctx.strokeStyle = '#fff'; ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) { ctx.lineWidth = 3 - i; ctx.beginPath(); ctx.arc(f.x + 16, f.y, (f.wide ? 46 : 28) + i * 6, Math.PI * 0.62, Math.PI * 1.38); ctx.stroke(); }
    } else if (f.k === 'f') { ctx.globalAlpha = a * 0.85; const gr = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r); gr.addColorStop(0, '#fff2a0'); gr.addColorStop(0.5, '#ff8a2b'); gr.addColorStop(1, 'rgba(255,60,20,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.3); ctx.fill(); }
    else if (f.k === 's') { ctx.globalAlpha = a; ctx.fillStyle = '#fff6b0'; for (let i = 0; i < 4; i++) { const an = i * 1.57 + (1 - a) * 2, d = (1 - a) * 22 + 4; ctx.beginPath(); ctx.arc(f.x + Math.cos(an) * d, f.y + Math.sin(an) * d, 2.4 * a + 0.6, 0, 6.3); ctx.fill(); } }
    else if (f.k === 'flash') { ctx.globalAlpha = a; ctx.fillStyle = f.col; ctx.fillRect(0, 0, W, H); }
    else if (f.k === 't') {
      ctx.globalAlpha = Math.min(1, a * 2.2); ctx.font = `800 ${f.size}px ${FONT}`; ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = '#271c33'; ctx.lineJoin = 'round';
      ctx.strokeText(f.t, f.x, f.y); ctx.fillStyle = f.col; ctx.fillText(f.t, f.x, f.y);
    }
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- drawing the world
function shadow(x, y, rx) { ctx.fillStyle = 'rgba(30,20,50,.22)'; ctx.beginPath(); ctx.ellipse(x, y, rx, rx * 0.22, 0, 0, 6.3); ctx.fill(); }
function glowBehind(x, y, r, col) { const gr = ctx.createRadialGradient(x, y, 2, x, y, r); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.3); ctx.fill(); }

function drawStack(cx, list, t, marching, hpBars) {
  list.forEach((c, i) => {
    const d = CAT_BY_ID[c.id];
    const sc = 1.0 * (1 + 0.06 * (c.lvl - 1));
    const hop = marching ? Math.abs(Math.sin(t * 9 + i * 0.7)) * 3.2 : Math.sin(t * 2.4 + i) * 1.3;
    const feetY = GROUND - i * SLOT - hop;
    const atk = c.atk > 0 ? c.atk / 0.22 : 0;
    const lunge = atk * 7;
    if (i === 0) shadow(cx, GROUND + 3, 46);
    if (c.lvl >= 2) glowBehind(cx, feetY - 44, 52 + c.lvl * 6, c.lvl === 3 ? 'rgba(255,210,80,.55)' : 'rgba(255,225,140,.35)');
    ctx.save();
    ctx.translate(cx + lunge, feetY);
    ctx.scale(1 + atk * 0.05, 1 - atk * 0.06);
    ctx.rotate(Math.sin(t * 2 + i * 1.3) * 0.015 + (marching ? Math.sin(t * 9 + i) * 0.03 : 0));
    ctx.drawImage(catSprite(c.id), -60 * sc, -107 * sc, 120 * sc, 120 * sc);
    if (c.flash > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(0.8, c.flash * 4); ctx.drawImage(catSprite(c.id), -60 * sc, -107 * sc, 120 * sc, 120 * sc); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
    ctx.restore();
    if (c.lvl === 3) { ctx.fillStyle = '#fff6b0'; for (let k = 0; k < 3; k++) { const an = t * 2 + k * 2.1; ctx.beginPath(); ctx.arc(cx + Math.cos(an) * 40, feetY - 44 + Math.sin(an) * 26, 2.4, 0, 6.3); ctx.fill(); } }
    if (hpBars) {
      const bx = cx - 128, by = feetY - 50, bw = 64;
      ctx.font = `800 12px ${FONT}`; ctx.textAlign = 'left'; ctx.lineWidth = 3.5; ctx.strokeStyle = '#271c33'; ctx.strokeText(d.name, bx, by - 3); ctx.fillStyle = '#fff'; ctx.fillText(d.name, bx, by - 3);
      if (c.lvl > 1) { ctx.textAlign = 'right'; ctx.strokeText('\u2605'.repeat(c.lvl), bx + bw, by - 3); ctx.fillStyle = '#ffd23f'; ctx.fillText('\u2605'.repeat(c.lvl), bx + bw, by - 3); ctx.textAlign = 'left'; }
      ctx.fillStyle = 'rgba(39,28,51,.8)'; ctx.beginPath(); ctx.roundRect(bx - 1, by, bw + 2, 9, 5); ctx.fill();
      const r = Math.min(1, Math.max(0, c.hp / c.max));
      ctx.fillStyle = r > 0.5 ? '#5fe08a' : r > 0.25 ? '#ffc94a' : '#ff6b6b';
      ctx.beginPath(); ctx.roundRect(bx, by + 1, Math.max(3, bw * r), 7, 4); ctx.fill();
    }
  });
}

function drawEnemy(e, t) {
  if (e.dead) return;
  let y = e.y;
  const walking = !e.boss && !e.fly && e.stun <= 0;
  if (e.fly) y -= e.alt + Math.sin(t * 4 + e.t) * 5;
  const hop = walking ? Math.abs(Math.sin(e.t * 9)) * 3 : 0;
  if (!e.fly) shadow(e.x, e.y + 1, e.boss ? 80 : e.w * 0.5);
  else shadow(e.x, e.y + 1, e.w * 0.35);
  ctx.save();
  ctx.translate(e.x, y - hop);
  if (e.boss) {
    const spr = nestSprite(e.kind);
    const pulse = e.swing > 0 ? 1 + e.swing * 0.12 : 1;
    if (e.flash > 0) ctx.translate((Math.random() - 0.5) * 3, 0);
    ctx.scale(1.25 * pulse, 1.25 * (2 - pulse));
    ctx.drawImage(spr.c, -spr.ax, -spr.ay, spr.w, spr.h);
    ctx.translate(-spr.ax, -spr.ay);
    nestOverlay(ctx, e.hp / e.maxHp, t);
    if (e.flash > 0) { ctx.translate(spr.ax, spr.ay); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35; ctx.drawImage(spr.c, -spr.ax, -spr.ay, spr.w, spr.h); }
  } else {
    const spr = enemySprite(e.type, e.elite);
    const sc = e.elite ? 1.16 : 1;
    ctx.translate(-(e.swing > 0 ? 6 * e.swing / 0.3 : 0), 0);
    ctx.rotate(Math.sin(e.t * 9) * (walking ? 0.05 : 0));
    ctx.scale(sc, sc);
    ctx.drawImage(spr.c, -spr.ax, -spr.ay, spr.w, spr.h);
    if (e.flash > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.6; ctx.drawImage(spr.c, -spr.ax, -spr.ay, spr.w, spr.h); }
    if (e.slowT > 0 && e.slow > 0) { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.9; ctx.font = '16px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('❄', 0, -e.h - 6); }
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  if (e.stun > 0 && !e.boss) { ctx.fillStyle = '#ffe14d'; for (let k = 0; k < 3; k++) { const an = t * 6 + k * 2.1; ctx.beginPath(); ctx.arc(e.x + Math.cos(an) * 10, y - e.h - 4 + Math.sin(an) * 3, 2.2, 0, 6.3); ctx.fill(); } }
  if (e.burn) { ctx.font = '14px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('🔥', e.x, y - e.h - 8); }
  if (e.poison) { ctx.fillStyle = '#8be05a'; ctx.beginPath(); ctx.arc(e.x + 12, y - e.h * 0.9 + Math.sin(t * 6) * 2, 3, 0, 6.3); ctx.fill(); }
  if (e.hp < e.maxHp && !e.boss) {
    const w = Math.max(26, e.w) * 0.9, top = y - (e.boss ? 150 : e.h * (e.elite ? 1.28 : 1.12)) - 6;
    ctx.fillStyle = 'rgba(39,28,51,.8)'; ctx.beginPath(); ctx.roundRect(e.x - w / 2 - 1, top, w + 2, 6, 3); ctx.fill();
    ctx.fillStyle = e.elite ? '#ffd23f' : '#ff7a8a'; ctx.beginPath(); ctx.roundRect(e.x - w / 2, top + 1, Math.max(2, w * e.hp / e.maxHp), 4, 2); ctx.fill();
  }
}

function drawProj(p, t, ids) {
  if (p.kind === 'lob') {
    ctx.fillStyle = p.color || '#333'; ctx.strokeStyle = '#271c33'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, 6.3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.arc(p.x - 2, p.y - 2, 2, 0, 6.3); ctx.fill();
    return;
  }
  if (p.kind === 'enemy') {
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(t * 10);
    if (p.big) { ctx.fillStyle = '#ffd34a'; ctx.strokeStyle = '#8a5a14'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-9, 6); ctx.lineTo(9, 6); ctx.lineTo(0, -9); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#e0a52a'; ctx.beginPath(); ctx.arc(1, 1, 2, 0, 6.3); ctx.fill(); }
    else { ctx.fillStyle = '#9a9aa8'; ctx.strokeStyle = '#271c33'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(0, 0, 5, 0, 6.3); ctx.fill(); ctx.stroke(); }
    ctx.restore();
    return;
  }
  const id = ids.get(p.owner), col = p.fx.color || '#fff';
  const sp = Math.hypot(p.vx, p.vy), ux = p.vx / sp, uy = p.vy / sp;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = col; ctx.globalAlpha = 0.35; ctx.lineWidth = p.r * 1.6;
  ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - ux * Math.min(60, sp * 0.06), p.y - uy * Math.min(60, sp * 0.06)); ctx.stroke();
  ctx.globalAlpha = 1;
  if (id === 'shadow') { ctx.translate(p.x, p.y); ctx.rotate(t * 20); ctx.fillStyle = '#dfe6f2'; ctx.strokeStyle = '#271c33'; ctx.lineWidth = 1; ctx.beginPath(); for (let i = 0; i < 8; i++) { const r = i % 2 ? 2.4 : 7; ctx.lineTo(Math.cos(i * 0.785) * r, Math.sin(i * 0.785) * r); } ctx.closePath(); ctx.fill(); ctx.stroke(); }
  else if (id === 'pudding') { ctx.fillStyle = '#ff6b9a'; ctx.font = '15px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('♥', p.x, p.y + 5); }
  else if (id === 'lyra') { ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#271c33'; ctx.lineWidth = 2.5; ctx.font = `800 18px ${FONT}`; ctx.textAlign = 'center'; ctx.strokeText('♪', p.x, p.y + 6); ctx.fillText('♪', p.x, p.y + 6); }
  else if (id === 'yuki') { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#7fc8ff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, 6.3); ctx.fill(); ctx.stroke(); }
  else if (id === 'hawkeye') { ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - ux * 34, p.y - uy * 34); ctx.stroke(); }
  else if (id === 'mecha') { ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.vy, p.vx)); ctx.fillStyle = '#e0e6f0'; ctx.strokeStyle = '#271c33'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(-8, -3, 14, 6, 3); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#ff5d3a'; ctx.beginPath(); ctx.moveTo(6, -3); ctx.lineTo(11, 0); ctx.lineTo(6, 3); ctx.fill(); }
  else if (id === 'boo') { glowBehind(p.x, p.y, 14, 'rgba(185,245,255,.9)'); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, 6.3); ctx.fill(); }
  else { glowBehind(p.x, p.y, p.r * 3.2, col + 'aa'); ctx.fillStyle = col; ctx.strokeStyle = '#271c33'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 1, 0, 6.3); ctx.fill(); ctx.stroke(); }
  ctx.restore();
}

function drawField(t) {
  const alive = S.aliveCats(g);
  const ids = new Map(g.cats.map((c) => [c.uid, c.id]));
  // pools and mines sit on the ground
  for (const p of g.pools) { const a = Math.min(1, p.t / 1.2); ctx.globalAlpha = 0.75 * a; const gr = ctx.createRadialGradient(p.x, GROUND + 14, 4, p.x, GROUND + 14, p.r); gr.addColorStop(0, '#ffd23f'); gr.addColorStop(0.5, '#ff6a2b'); gr.addColorStop(1, 'rgba(255,60,20,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(p.x, GROUND + 14, p.r, p.r * 0.32, 0, 0, 6.3); ctx.fill(); }
  ctx.globalAlpha = 1;
  for (const m of g.mines) { ctx.fillStyle = '#4a4a5a'; ctx.strokeStyle = '#271c33'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(m.x, GROUND + 10, 13, 6, 0, 0, 6.3); ctx.fill(); ctx.stroke(); ctx.fillStyle = Math.sin(t * 8) > 0 ? '#ff5d5d' : '#7a2a2a'; ctx.beginPath(); ctx.arc(m.x, GROUND + 6, 3, 0, 6.3); ctx.fill(); }
  // tower first, then mice sorted by lane (nearer the bottom of the screen draws last)
  const list = alive.map((c) => ({ id: c.id, lvl: c.lvl, hp: c.hp, max: S.catMaxHp(g, c), flash: c.flash, atk: c.atk }));
  drawStack(g.towerX, list, t, g.marching && g.state === 'fight', true);
  const es = g.enemies.filter((e) => !e.dead).sort((a, b) => a.y - b.y);
  for (const e of es) drawEnemy(e, t);
  for (const p of g.projs) drawProj(p, t, ids);
  if (g.zoomT > 0) {
    ctx.strokeStyle = 'rgba(255,200,230,.5)'; ctx.lineWidth = 2;
    for (let i = 0; i < 14; i++) { const y = 60 + ((i * 97 + t * 900) % 380), x = (i * 211 + t * 1400) % (W + 200) - 100; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 90, y); ctx.stroke(); }
  }
}

function drawTitleScene(t) {
  const cx = 100;
  const list = titleStack.map((id, i) => ({ id, lvl: i === 0 ? 2 : 1, hp: 1, max: 1, flash: 0, atk: Math.max(0, Math.sin(t * 3 + i) - 0.8) }));
  drawStack(cx, list, t, true, false);
  for (let i = 0; i < 5; i++) {
    const x = ((i * 190 - t * 60) % 1000 + 1000) % 1000 + 330;
    const type = ['mouse', 'scout', 'slinger', 'armored', 'mouse'][i];
    const spr = enemySprite(type, false);
    const y = GROUND + 8 + (i % 3) * 9;
    shadow(x, y, 18);
    ctx.save(); ctx.translate(x, y - Math.abs(Math.sin(t * 9 + i)) * 3); ctx.drawImage(spr.c, -spr.ax, -spr.ay, spr.w, spr.h); ctx.restore();
  }
}

let vig = null;
function vignette() {
  if (!vig) { vig = document.createElement('canvas'); vig.width = W; vig.height = H; const x = vig.getContext('2d'); const gr = x.createRadialGradient(W / 2, H / 2, H * 0.55, W / 2, H / 2, H * 1.0); gr.addColorStop(0, 'rgba(20,10,40,0)'); gr.addColorStop(1, 'rgba(20,10,40,.45)'); x.fillStyle = gr; x.fillRect(0, 0, W, H); }
  ctx.drawImage(vig, 0, 0);
}

function render(dt) {
  const t = tAnim;
  ctx.save();
  if (shake > 0.2) { ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); shake = Math.max(0, shake - dt * 40); }
  if (!bd) setBackdrop(0);
  const inRun = g && mode !== 'title';
  if (!inRun) titleScroll += dt * 40;
  drawBackdrop(ctx, bd, inRun ? g.scroll : titleScroll, t);
  if (inRun) {
    drawField(t);
  } else drawTitleScene(t);
  drawFx();
  ctx.restore();
  vignette();
}

// ---------------------------------------------------------------- input
function togglePause() { if (mode !== 'play') return; if (paused) { paused = false; closeScreen(); } else showPause(); }
function doZoomies() { if (mode === 'play' && !paused && S.useZoomies(g)) drain(); }
function toggleSpeed() { speed = speed === 1 ? 2 : 1; $('bSpeed').textContent = 'x' + speed; }
$('bPause').addEventListener('click', () => { sfx.unlock(); togglePause(); });
$('bSpeed').addEventListener('click', () => { sfx.unlock(); toggleSpeed(); });
$('bSound').addEventListener('click', () => { sfx.unlock(); save.sound = !save.sound; sfx.on = save.sound; persist(); toast(save.sound ? 'Sound on' : 'Sound off'); });
$('zoom').addEventListener('click', () => { sfx.unlock(); doZoomies(); });
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  if (k === ' ') { e.preventDefault(); doZoomies(); }
  else if (k === 'p' || k === 'escape') togglePause();
  else if (k === 'f') toggleSpeed();
  else if (k === 'm') { save.sound = !save.sound; sfx.on = save.sound; persist(); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'play' && !paused) showPause(); });
addEventListener('pagehide', () => { if (g && mode !== 'over' && g.wave > 1) commitRun(); });

// ---------------------------------------------------------------- main loop
function frame(ts) {
  const dt = Math.min(0.05, (ts - last) / 1000);
  last = ts;
  tAnim += dt;
  if (g && mode === 'play' && !paused) {
    acc += dt * speed;
    let n = 0;
    while (acc >= S.DT && n < 8) {
      S.step(g, S.DT); acc -= S.DT; n++;
      if (g.state === 'clear' || g.state === 'over') break;
    }
    if (n >= 8) acc = 0;
    drain();
    updateFx(dt * speed);
    if (g.state === 'clear') onClear(); else if (g.state === 'over') onOver();
  } else {
    if (g && g.ev.length) g.ev.length = 0;
    updateFx(paused ? 0 : dt);
  }
  render(dt);
  updateHud();
  requestAnimationFrame(frame);
}

window.stackingCats = { get g() { return g; }, get mode() { return mode; }, S, save: () => save, startRun, toast };
showTitle();
requestAnimationFrame(frame);
void ENEMY_TYPES;

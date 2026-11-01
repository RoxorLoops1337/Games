import { W, power, spendEnergy, tickEnergy, ENERGY_MAX, ENERGY_COST, buyEnergy, reviveGame, reviveCost, recPower, levelInfo, HARD_HP, PETS, PET_MAX_STAR, PET_SLOTS, petCost, petCanUp, petUp, togglePet, hatchEgg, buyEgg, EGG_PRICE, dayLogin, pigTier, usePigAttempt, PIG_NAME, RARITIES, LOADOUT_SIZE, toggleLoadout, dailyGoals, addRunStats, goalProgress, claimGoal, createGame, step, choose, reroll, botInput, buildPath, pointAt, stageInfo, canPlay, clearReward, META, WEAPONS, BOXES, SKILL_MAX_LV, metaCost, skillUpgradeCost, buyMeta, unlockSkill, levelSkill, openBox, applyResult, defaultSave, sanitizeSave } from './sim.js';
import { createHub2 } from './hub2.js';
import { loadArt } from './art.js';
import { createRenderer } from './render.js';
import { createArtDraw } from './art_draw.js';
import { createAudio } from './audio.js';

const SAVE_KEY = 'cell_serpent_save_v1';   // never rename: it is the live save slot (the save itself is versioned inside)
const $ = id => document.getElementById(id);
const canvas = $('c');
let save = defaultSave();
try { save = sanitizeSave(JSON.parse(localStorage.getItem(SAVE_KEY))); } catch (e) { /* private mode */ }
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } };

const audio = createAudio();
audio.setMuted(save.muted);
let art = null, R = null, kit = null;
const dayKey = () => Math.floor(Date.now() / 86400000);
let slowFrames = 0, fastFrames = 0;
let reviveAsked = false, hard = false, mode = 'title', g = null, demo = null, acc = 0, last = 0, endT = 0, cardsFor = null, hubTab = 'Battle', sel = 1, ranResult = false;
const joy = { on: false, id: -1, x: 0, y: 0, dx: 0, dy: 0 };
const keys = {};

let dprCap = 2;   // lowered automatically on slow phones (dynamic resolution)
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
  canvas.width = Math.round(innerWidth * dpr); canvas.height = Math.round(innerHeight * dpr);
}
addEventListener('resize', resize); resize();

function show(id) { for (const s of document.querySelectorAll('.scr')) s.classList.toggle('on', s.id === id); $('muteBtn').classList.toggle('on', id === 'title' || id === 'pause'); }
function refreshCur() { for (const [id, v] of [['tBeats', save.beats], ['hBeats', save.beats], ['tSpark', save.sparkles], ['hSpark', save.sparkles]]) $(id).textContent = v; const pw = $('hPower'); if (pw) { const li = levelInfo(save.xp); pw.textContent = 'Lv ' + li.lv + '  ·  Power ' + power(save); } const en = $('hEnergy'); if (en) en.textContent = tickEnergy(save, Date.now()) + '/' + ENERGY_MAX; }

// ---------------------------------------------------------------- icons (all drawn by the art kit)
const iconCache = {};
const WICON = { daggers: 'dagger', needles: 'needle' };
function iconURL(id) {
  if (id in iconCache) return iconCache[id];
  let spr = null;
  if (kit) {
    if (['aspd', 'notes', 'burst', 'cdmg'].includes(id)) spr = kit.SPR.note(id === 'cdmg');
    else if (id === 'beats') spr = kit.SPR.pickup('coin');
    else if (id === 'sparkles') spr = kit.SPR.pickup('spark');
    else if (id === 'boxbeat' || id === 'boxspark' || id === 'chest') spr = kit.SPR.pickup(id);
    else if (id === 'egg') spr = kit.SPR.pickup('egg');
    else if (PETS.some(p => p.id === id)) spr = kit.SPR.pet(id);
    else if (WEAPONS.some(w => w.id === id)) spr = kit.SPR.weapon(WICON[id] || id);
  }
  return (iconCache[id] = spr && spr.c.toDataURL ? spr.c.toDataURL() : '');
}
const PICON = { power: '🎤', haste: '⏱️', crit: '🎯', vital: '❤️', guard: '🎧', speed: '👟' };
const icon = id => (PICON[id] ? PICON[id] : PETS.some(p => p.id === id) ? (iconURL(id) ? `<img src="${iconURL(id)}" alt="">` : '🐾') : id === 'egg' ? (iconURL('egg') ? `<img src="${iconURL('egg')}" alt="">` : '🥚') : iconURL(id) ? `<img ${WEAPONS.some(w => w.id === id) || id === 'maw' ? 'class="zoom" ' : ''}src="${iconURL(id)}" alt="">` : (id[0] || '?').toUpperCase());
const STATICON = { atk: '🔊', crt: '🎵', cdn: '⏱️', vit: '❤️', for: '⭐', rev: '🎤' };
function tile({ cls = '', ic, name, chip, chipCls = '', desc, bar, barText, pips, btn, gold, disabled, onclick, one }) {
  const t = document.createElement('div'); t.className = 'tile ' + cls + (one ? ' one' : '');
  t.innerHTML = `<div class="top"><div class="ic">${ic}</div><div style="min-width:0"><div class="nm">${name}</div>${chip ? `<span class="lv ${chipCls}">${chip}</span>` : ''}</div></div>` +
    `<div class="ds">${desc}</div>` + (bar !== undefined ? `<div class="bar"><i style="width:${bar}%"></i></div><div class="sm">${barText || ''}</div>` : '') + (pips ? `<div class="pips">${pips}</div>` : '') +
    (btn ? `<button class="btn small go ${gold ? 'gold' : ''}" ${disabled ? 'disabled' : ''}>${btn}</button>` : '');
  const b = t.querySelector('button'); if (b && onclick) b.onclick = onclick;
  return t;
}
function loadoutRow(el, link) {
  el.innerHTML = '';
  for (let i = 0; i < LOADOUT_SIZE; i++) {
    const id = save.loadout[i], b = document.createElement('button'); b.className = 'slot' + (id ? ' full' : '');
    b.innerHTML = id ? icon(id) : '+';
    if (id && !link) b.title = 'Tap to remove';
    b.onclick = () => { audio.play('click'); if (link) { hubTab = 'Skills'; renderHub(); } else if (id && toggleLoadout(save, id)) { persist(); renderHub(); } };
    el.appendChild(b);
  }
}
const curImg = c => `<img src="${iconURL(c)}" alt="" style="width:22px;height:22px;vertical-align:middle">`;
const skillLevels = () => Object.fromEntries(Object.entries(save.skills).map(([id, k]) => [id, k.lv]));

// ---------------------------------------------------------------- hub
const TABS = ['Shop', 'Stats', 'Battle', 'Skills', 'Pets', 'Gear'];
function openHub(tab = hubTab) {
  mode = 'hub'; hubTab = tab; audio.music(false);
  if (dayLogin(save, dayKey())) persist();
  refreshCur();
  sel = Math.max(1, Math.min(sel, save.cleared + 4));
  renderHub(); show('hub');
}
function renderHub() {
  refreshCur();
  for (const t of TABS) { $('tab' + t).classList.toggle('on', t === hubTab); }
  for (const b of document.querySelectorAll('.tabs button')) b.classList.toggle('on', b.dataset.tab === hubTab);
  if (hubTab === 'Battle') renderBattle(); else if (hubTab === 'Skills') renderSkills(); else if (hubTab === 'Pets') renderPets(); else if (hubTab === 'Stats') hub2.renderStats(); else if (hubTab === 'Gear') hub2.renderGear(); else hub2.renderShop();
}
for (const b of document.querySelectorAll('.tabs button')) b.onclick = () => { audio.unlock(); audio.play('click'); hubTab = b.dataset.tab; renderHub(); };

function renderBattle() {
  const info = stageInfo(sel), playable = canPlay(save, sel), done = sel <= save.cleared;
  $('stTitle').textContent = `Stage ${sel}: ${info.name}`;
  $('stSub').textContent = `${info.path}${info.boss ? '  ·  BOSS' : ''}`;
  $('stPrev').disabled = sel <= 1; $('stNext').disabled = sel >= save.cleared + 4;
  const chips = $('stChips'); chips.innerHTML = '';
  for (let n = 1; n <= save.cleared + 4; n++) {
    const c = document.createElement('button'); c.className = 'chip' + (n === sel ? ' sel' : '') + (n > save.cleared + 1 ? ' lock' : '') + (n <= save.cleared ? ' done' : '');
    c.textContent = n > save.cleared + 1 ? '🔒' : n; c.onclick = () => { audio.play('click'); sel = n; renderBattle(); };
    chips.appendChild(c);
  }
  if (sel > save.cleared) hard = false;
  const hardOk = sel <= save.cleared;
  $('diffRow').innerHTML = `<button class="dbtn ${hard ? '' : 'on'}" data-h="0">Normal</button><button class="dbtn hard ${hard ? 'on' : ''}" data-h="1" ${hardOk ? '' : 'disabled'}>${hardOk ? 'Hard' : '🔒 Hard'}</button><span class="rec">Recommended ${recPower(sel, hard)}</span>`;
  for (const b of $('diffRow').querySelectorAll('.dbtn')) b.onclick = () => { audio.play('click'); hard = b.dataset.h === '1'; renderBattle(); };
  const first = !done ? `<span>First clear <b>${curImg('sparkles')} ${clearReward(sel).sparkles}</b></span>` : '<span><b>Cleared ✓</b></span>';
  $('stInfo').innerHTML = `<span>Cells <b>${info.length}</b></span><span>Cell HP <b>${(h => (h >= 1000 ? (h / 1000).toFixed(1) + 'k' : h))(Math.round(info.hp * (hard ? HARD_HP : 1)))}</b></span>${first}`;
  const go = $('stGo'); go.disabled = !playable; go.textContent = playable ? 'START THE BATTLE  ⚡' + ENERGY_COST : `CLEAR STAGE ${save.cleared + 1} FIRST`;
  loadoutRow($('battleLoad'), true);
  { const pr = save.prog[(hard ? 'h' : '') + sel] || 0; $('stProg').innerHTML = `<div class="pgl">Highest progress <b>${pr}%</b></div><div class="pgr"><i style="width:${pr}%"></i>${[25, 50, 100].map(t => `<span class="${pr >= t ? 'got' : ''}" style="left:${t}%">${icon('chest')}<em>${t}%</em></span>`).join('')}</div>`; }
  hub2.renderSide();
  renderPig();
  renderGoals();
  const chip = chips.querySelector('.sel'); if (chip && chip.scrollIntoView) { try { chips.scrollTo({ left: chip.offsetLeft - 120 }); } catch (e) { /* ignore */ } }
}
$('stPrev').onclick = () => { audio.play('click'); sel = Math.max(1, sel - 1); renderBattle(); };
$('stNext').onclick = () => { audio.play('click'); sel = Math.min(save.cleared + 4, sel + 1); renderBattle(); };
$('stGo').onclick = () => { audio.unlock(); audio.play('click'); beginStage(sel); };
$('enPlus').onclick = () => { audio.unlock(); if (buyEnergy(save, Date.now())) { persist(); audio.play('upgrade'); refreshCur(); toast('Voice +10'); } else toast('Not enough Sparkles'); };
// a stage costs Voice; the Piggy Bank Parade is free
function beginStage(stage) {
  if (!spendEnergy(save, Date.now())) { toast('Out of Voice! Rest a bit or grab some tea in the Shop'); openHub('Battle'); return; }
  persist(); startRun(stage);
}

// the stage picture: the lane for this stage with the virus on it
const stCtx = $('stCanvas').getContext('2d');
let pvKey = -1, pvPath = null;
function drawPreview(t) {
  if (!kit) return;
  const c = stCtx, w = 660, h = 620, info = stageInfo(sel);
  if (pvKey !== sel) { pvKey = sel; pvPath = buildPath(sel); }
  const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#2b2260'); gr.addColorStop(1, '#150f38'); c.fillStyle = gr; c.fillRect(0, 0, w, h);
  const k = Math.min((w - 60) / 720, (h - 50) / 1280) * 1.0, ox = (w - 720 * k) / 2, oy = 24;
  c.save(); c.translate(ox, oy); c.scale(k, k);
  c.lineJoin = 'round'; c.lineCap = 'round'; c.beginPath(); pvPath.pts.forEach((q, i) => (i % 3 === 0 ? (i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y)) : 0));
  c.lineWidth = 90; c.strokeStyle = 'rgba(255,255,255,.07)'; c.stroke(); c.lineWidth = 8; c.strokeStyle = 'rgba(255,255,255,.2)'; c.setLineDash([22, 30]); c.lineDashOffset = -t * 60; c.stroke(); c.setLineDash([]);
  c.strokeStyle = 'rgba(255,150,190,.8)'; c.lineWidth = 12; c.beginPath(); c.moveTo(0, 1190); c.lineTo(720, 1190); c.stroke();
  const head = 700 + Math.sin(t * 1.2) * 60, n = Math.min(info.length, 16);
  for (let i = n - 1; i >= 1; i--) {
    const ps = head - i * 47, a = pointAt(pvPath, ps), b = pointAt(pvPath, ps + 10), kind = info.boss ? true : false;
    const spr = kit.SPR.body(info.skin, kind, ''); if (spr) kit.blit(c, spr, a.x, a.y, 30 * 3.9 * (i > n - 4 ? 0.8 : 1), Math.atan2(b.y - a.y, b.x - a.x));
  }
  const hp = pointAt(pvPath, head), hp2 = pointAt(pvPath, head + 10);
  kit.drawHead(c, hp.x, hp.y, 38 * (info.boss ? 1.3 : 1) * 1.14, Math.atan2(hp2.y - hp.y, hp2.x - hp.x), { skin: info.skin, boss: info.boss, t, look: [0, 1] });
  const duo = art && art.get('duo_idle'); if (duo) { const dh = 190, dw = dh * duo.width / duo.height; c.drawImage(duo, 360 - dw / 2, 1090 - dh * 0.75, dw, dh); }
  c.restore();
}

function renderPig() {
  const el = $('pigBox'); el.innerHTML = '';
  const left = save.pig.left, tier = pigTier(save);
  el.appendChild(tile({ cls: 't-gold one', ic: '🐷', name: PIG_NAME, chip: 'Tier ' + tier + '  ·  ' + left + '/3 today', desc: 'A parade of piggy banks. Shake them hard.', btn: left ? 'JOIN THE PARADE' : 'COME BACK TOMORROW', gold: true, disabled: !left,
    onclick: () => { audio.unlock(); audio.play('click'); if (usePigAttempt(save, dayKey())) { persist(); startRun(tier, 'pig'); } } }));
}
function renderPets() {
  const list = $('petList'); list.innerHTML = '';
  const egg = tile({ cls: 't-gold one', ic: icon('egg'), name: 'Eggs', chip: '× ' + save.eggs, desc: 'Something is wiggling inside.', btn: 'HATCH', gold: true, disabled: save.eggs < 1,
    onclick: () => { audio.unlock(); const h = hatchEgg(save); if (!h) return; persist(); audio.play('levelup'); refreshCur();
      $('bTitle').textContent = h.beats ? 'JUST SOME SNACKS' : (PETS.find(p => p.id === h.id).name.toUpperCase() + '!');
      $('bLoot').innerHTML = h.beats ? `<div class="it">${curImg('beats')}<span>+${h.beats}</span></div>` : `<div class="it">${icon(h.id)}<span>+${h.n}</span></div>`;
      $('bOk').onclick = () => { audio.play('click'); $('bOk').onclick = defaultBoxOk; openHub('Pets'); }; show('boxModal'); } });
  list.appendChild(egg);
  for (const p of PETS) {
    const k = save.pets[p.id], owned = k.star > 0, maxed = k.star >= PET_MAX_STAR, need = maxed ? 0 : petCost(k.star), eq = save.petEquip.includes(p.id);
    const stars = '★ ' + k.star + '/' + PET_MAX_STAR;
    const t = tile({ cls: 't-weapon' + (eq ? ' on-loadout' : ''), ic: icon(p.id), name: p.name, chip: owned ? stars : 'NEW', chipCls: owned ? (eq ? 'eq' : '') : 'lock', desc: p.flavor,
      bar: need ? Math.min(100, Math.round((k.frag / need) * 100)) : 100, barText: need ? k.frag + ' / ' + need : '', btn: maxed ? 'FULL STARS' : owned ? 'MORE STARS' : 'WELCOME HOME', disabled: !petCanUp(save, p.id),
      onclick: () => { if (petUp(save, p.id)) { persist(); audio.unlock(); audio.play('upgrade'); renderHub(); } } });
    if (owned) { const e = document.createElement('button'); e.className = 'btn small go alt'; e.textContent = eq ? 'BENCH' : 'WALK WITH ME'; e.onclick = () => { if (togglePet(save, p.id)) { persist(); audio.play('click'); renderHub(); } }; t.appendChild(e); }
    list.appendChild(t);
  }
}
function renderGoals() {
  const list = $('goalList'); list.innerHTML = '';
  const day = dayKey();
  for (const goal of dailyGoals(day)) {
    const prog = goalProgress(save, day, goal), done = prog >= goal.target, claimed = !!(save.daily && save.daily.day === day && save.daily.claimed[goal.id]);
    const rw = goal.reward.beats ? `${goal.reward.beats} ${curImg('beats')}` : `${goal.reward.sparkles} ${curImg('sparkles')}`;
    const card = tile({ cls: 't-gold one', ic: '🎯', name: goal.text, desc: '', bar: Math.round(Math.min(1, prog / goal.target) * 100), barText: prog + ' / ' + goal.target, btn: claimed ? 'CLAIMED' : done ? 'CLAIM ' + rw : rw, gold: true, disabled: !(done && !claimed),
      onclick: () => { if (claimGoal(save, day, goal.id)) { persist(); audio.unlock(); audio.play('levelup'); renderHub(); } } });
    card.querySelector('.ds').remove();
    list.appendChild(card);
  }
}
function renderSkills() {
  const list = $('skillList'); list.innerHTML = '';
  loadoutRow($('loadoutRow'), false);
  const groups = [[], [], []];
  for (const w of WEAPONS) {
    const k = save.skills[w.id], owned = k.lv > 0, eq = save.loadout.includes(w.id);
    let need = 0, can = false, label = '', act = () => false;
    const gated = !owned && (save.cleared || 0) < (w.stage || 0);
    if (!owned) { need = w.frag; can = k.frag >= need && !gated; label = gated ? 'CLEAR STAGE ' + w.stage : 'UNLOCK'; act = () => unlockSkill(save, w.id); }
    else if (k.lv >= SKILL_MAX_LV) label = 'MAX LEVEL';
    else { const c = skillUpgradeCost(k.lv); need = c.frag; can = k.frag >= c.frag; label = 'UPGRADE'; act = () => levelSkill(save, w.id); }
    const t = tile({ cls: 't-weapon tier' + (w.tier || 0) + (eq ? ' on-loadout' : '') + (owned ? '' : ' unowned'), ic: icon(w.id), name: w.name, chip: owned ? ('Lv ' + k.lv + (eq ? ' ✓' : '')) : 'LOCKED', chipCls: owned ? (eq ? 'eq' : '') : 'lock', desc: w.desc,
      bar: need ? Math.min(100, Math.round((k.frag / need) * 100)) : 100, barText: need ? 'Fragments ' + k.frag + ' / ' + need : 'Fully upgraded', btn: label, disabled: !can, onclick: () => { if (act()) { persist(); audio.unlock(); audio.play('upgrade'); renderHub(); } } });
    if (owned) {
      const e = document.createElement('button'); e.className = 'btn small go alt'; e.textContent = eq ? 'REMOVE FROM LOADOUT' : 'EQUIP';
      e.disabled = eq ? save.loadout.length <= 1 : save.loadout.length >= LOADOUT_SIZE;
      e.onclick = () => { if (toggleLoadout(save, w.id)) { persist(); audio.play('click'); renderHub(); } };
      t.appendChild(e);
    }
    groups[eq ? 0 : owned ? 1 : 2].push(t);
  }
  [['Equipped', '#6fe08a'], ['Owned', '#4fd8f0'], ['Not Owned', '#8a7aa8']].forEach(([name, col], i) => {
    if (!groups[i].length) return;
    const h = document.createElement('div'); h.className = 'sec'; h.innerHTML = `<span style="background:${col}">${name}</span>`; list.appendChild(h);
    for (const t of groups[i]) list.appendChild(t);
  });
}
const defaultBoxOk = () => { audio.play('click'); openHub('Shop'); };
$('bOk').onclick = defaultBoxOk;
const toast = msg => { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), 2200); };
const hub2 = createHub2({ $, tile, icon, curImg, audio, save: () => save, persist, show, openHub: t => openHub(t), renderHub: () => renderHub(), refreshCur: () => refreshCur(), dayKey, resetBoxOk: () => { $('bOk').onclick = defaultBoxOk; } });

// ---------------------------------------------------------------- runs
function newDemo() {
  demo = createGame({ seed: (Math.random() * 1e9) | 0, bot: true, stage: 1 + ((Math.random() * 3) | 0) });
  demo.p.hp = demo.p.maxHp = 9999;
  demo.weap = { swab: { lv: 2, cd: 0 }, daggers: { lv: 2, cd: 0 }, dragon: { lv: 1, cd: 0 } }; demo.ups = { notes: 1, aspd: 2 };
}
function startRun(stage, mode2 = '') {
  audio.unlock(); audio.music(true);
  sel = stage; ranResult = false; endT = 0;
  g = createGame({ seed: (Math.random() * 1e9) | 0, meta: save.meta, skills: skillLevels(), loadout: save.loadout, stage, mode: mode2, hard: hard && !mode2 && stage <= save.cleared, arts: Object.fromEntries(Object.entries(save.keeps).map(([k, v]) => [k, v.lv])), pets: Object.fromEntries(PETS.map(p => [p.id, save.pets[p.id].star])), petEquip: save.petEquip });
  mode = 'play'; acc = 0; cardsFor = null; reviveAsked = false; show('');
  window.CS.g = g;
}
function toTitle() { mode = 'title'; audio.music(false); refreshCur(); newDemo(); show('title'); }

// ---------------------------------------------------------------- upgrade cards
function showCards() {
  const wrap = $('cards'); wrap.innerHTML = '';
  g.choices.forEach((c, i) => {
    const rar = RARITIES[c.rarity || 0], b = document.createElement('button'); b.className = 'card pick c-' + c.kind + ' r' + (c.rarity || 0);
    const pips = Array.from({ length: Math.min(c.max, 12) }, (_, k) => `<span class="pip ${k < c.lvl + (c.gain && c.kind === 'weapon' ? c.gain : 1) ? 'on' : ''}"></span>`).join('');
    const tag = `<span class="rar">${rar.name.toUpperCase()}</span>` + (c.isNew ? '<span style="color:#9dff6d;font-size:13px"> NEW</span>' : '');
    b.innerHTML = `<div class="ic">${icon(c.id)}</div><div><div class="nm">${c.name}${tag}</div><div class="ds">${c.desc}</div>${c.stat ? `<div class="ds" style="color:#bfe9ff;font-weight:800">${c.stat}</div>` : ''}<div class="pips">${pips}</div></div>`;
    b.onclick = () => pick(i);
    wrap.appendChild(b);
  });
  $('refreshBtn').disabled = g.rerolls <= 0; $('refreshLeft').textContent = `Remaining attempts: ${g.rerolls}/4`;
  cardsFor = g.choices; show('levelup');
}
function pick(i) { if (mode !== 'play' || g.phase !== 'levelup') return; audio.play('upgrade'); choose(g, i); cardsFor = null; if (g.phase !== 'levelup') show(''); }
$('refreshBtn').onclick = () => { if (mode === 'play' && reroll(g)) { audio.play('click'); showCards(); } };

// ---------------------------------------------------------------- input
canvas.addEventListener('pointerdown', e => {
  audio.unlock();
  if (mode !== 'play' || g.phase === 'levelup') return;
  const gp = R.toGame(e.clientX * (canvas.width / innerWidth), e.clientY * (canvas.height / innerHeight));
  if (gp.x > W - 76 && gp.y < 76) { pause(); return; }
  if (gp.x > W - 76 && gp.y >= 76 && gp.y < 150) { showStats(); return; }
  if (joy.on) return;
  joy.on = true; joy.id = e.pointerId; joy.sx = e.clientX; joy.sy = e.clientY; joy.dx = joy.dy = 0;
  joy.x = gp.x; joy.y = gp.y;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  if (!joy.on || e.pointerId !== joy.id) return;
  const L = R.layout(), dpr = canvas.width / innerWidth, rad = 70 * L.s / dpr;
  let dx = (e.clientX - joy.sx) / rad;   // the cell slides left and right only
  if (Math.abs(dx) > 1) { dx = Math.sign(dx); joy.sx = e.clientX - dx * rad; }   // anchor follows the finger
  const gp = R.toGame(joy.sx * dpr, joy.sy * dpr); joy.x = gp.x;
  joy.dx = dx; joy.dy = 0;
});
const endJoy = e => { if (e.pointerId === joy.id) { joy.on = false; joy.dx = joy.dy = 0; } };
canvas.addEventListener('pointerup', endJoy); canvas.addEventListener('pointercancel', endJoy);
addEventListener('keydown', e => {
  keys[e.key.toLowerCase()] = true;
  if (e.key === 'Escape' || e.key.toLowerCase() === 'p') { mode === 'play' ? pause() : mode === 'pause' ? resume() : 0; }
  if (mode === 'play' && g.phase === 'levelup' && '123'.includes(e.key)) pick(+e.key - 1);
  if (e.key.toLowerCase() === 'm') toggleMute();
});
addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; if (mode === 'play' && g.phase !== 'levelup') pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'play' && g.phase !== 'levelup') pause(); });
function readInput() {
  let mx = joy.dx;
  if (keys.a || keys.arrowleft) mx -= 1; if (keys.d || keys.arrowright) mx += 1;
  return { mx, my: 0 };
}
function pause() { if (mode !== 'play' || g.phase === 'dead' || g.phase === 'won') return; mode = 'pause'; joy.on = false; joy.dx = joy.dy = 0; show('pause'); }
function resume() { mode = 'play'; show(''); last = performance.now(); }
function toggleMute() { save.muted = !save.muted; audio.setMuted(save.muted); $('muteBtn').textContent = save.muted ? '🔇' : '🔊'; persist(); }

// ---------------------------------------------------------------- result
function showRevive() {
  reviveAsked = true; const cost = reviveCost(g.revivesUsed);
  $('rvLeft').textContent = 'Remaining ×' + g.revivesLeft; $('rvGo').innerHTML = 'REVIVE  ' + cost + ' ' + curImg('sparkles'); $('rvGo').disabled = save.sparkles < cost;
  $('rvGo').onclick = () => { if (save.sparkles < cost) return; save.sparkles -= cost; persist(); reviveGame(g); reviveAsked = false; endT = 0; audio.play('levelup'); show(''); };
  $('rvNo').onclick = () => { audio.play('click'); g.revivesLeft = 0; reviveAsked = false; show(''); };
  show('revive');
}
function showStats() {
  if (mode !== 'play') return; mode = 'pause'; joy.on = false; joy.dx = joy.dy = 0;
  const tot = Object.values(g.dmgBy).reduce((a, v) => a + v, 0) || 1, rows = Object.entries(g.dmgBy).sort((a, b) => b[1] - a[1]);
  const nm = id => (id === 'capsule' ? 'Singing' : id === 'puppy' ? 'Puppy' : (WEAPONS.find(w => w.id === id) || { name: id }).name);
  hub2.openPanel('WHO DID WHAT', body => {
    body.innerHTML = rows.length ? rows.map(([id, v]) => `<div class="dmgrow"><span class="dn">${id === 'capsule' ? '🎤' : icon(id)} ${nm(id)}</span><div class="bar"><i style="width:${Math.round(v / tot * 100)}%"></i></div><b>${Math.round(v / tot * 100)}%</b></div>`).join('') : '<div class="sub">Nothing popped yet.</div>';
  }, () => { mode = 'play'; show(''); last = performance.now(); });
}
function showResult() {
  const r = g.result; if (!r || ranResult) return; ranResult = true;
  const out = applyResult(save, r); addRunStats(save, dayKey(), { ...r, kills: r.kills }); persist(); audio.music(false);
  const rows = [`<div class="r">${curImg('beats')}+${out.beats} Beats</div>`];
  if (out.egg) rows.push(`<div class="r">${icon('egg')}+1 Egg</div>`);
  if (out.sparkles) rows.push(`<div class="r">${curImg('sparkles')}+${out.sparkles} Sparkles (first clear)</div>`);
  for (const id of Object.keys(out.frags)) rows.push(`<div class="r">${icon(id)}+${out.frags[id]} ${WEAPONS.find(w => w.id === id).name} fragment</div>`);
  $('rList').innerHTML = rows.join('');
  $('rTitle').textContent = r.mode === 'pig' ? (r.won ? 'PIGGY BANKS CRACKED!' : 'THE PIGGIES ESCAPED') : r.won ? 'STAGE CLEAR!' : r.name.toUpperCase() + ' WINS';
  $('rSub').textContent = r.won ? (out.first && r.stage === 1 ? 'Stage select unlocked! Pick any stage you have cleared, or the next one.' : r.name + ' is down.') : `You popped ${r.kills} cells. Spend your Beats in the hub and try again.`;
  if (r.hard) hard = true;
  if (out.levelUps) rows.push(`<div class="r">⭐ Level ${levelInfo(save.xp).lv}!</div>`);
  if (r.cp50) rows.push(`<div class="r">⚡ +10 Voice back</div>`);
  $('rList').innerHTML = rows.join('');
  const pigRun = r.mode === 'pig', nextOk = !pigRun && r.won && canPlay(save, r.stage + 1);
  $('rNext').style.display = nextOk ? '' : 'none';
  $('rNext').onclick = () => { audio.play('click'); beginStage(r.stage + 1); };
  $('rRetry').style.display = pigRun ? 'none' : '';
  $('rRetry').onclick = () => { audio.play('click'); beginStage(r.stage); };
  $('rHub').onclick = () => { audio.play('click'); if (!pigRun) sel = r.won ? Math.min(r.stage + 1, save.cleared + 1) : r.stage; openHub('Battle'); };
  show('result'); mode = 'over';
}

// ---------------------------------------------------------------- loop
const SFX = { surgewarn: 'swarm', surge: 'roar', won: 'clear', chestdrop: 'power', chest: 'levelup' };
const FX_SOUND = new Set(['shoot', 'hit', 'kill', 'boom', 'coin', 'hurt', 'block', 'power', 'levelup', 'clear', 'stage', 'revive', 'dead', 'swarm', 'roar', 'surgewarn', 'surge', 'won', 'chestdrop', 'chest']);
function drain(game, sound) {
  const evs = game.events.splice(0);
  for (const e of evs) { R.onEvent(e, game); if (sound && FX_SOUND.has(e.t)) audio.play(SFX[e.t] || e.t, e); }
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000 || 0); last = now;
  if (!R) return;
  if (mode === 'play') {
    const ms = dt * 1000;
    if (ms > 26) { slowFrames++; fastFrames = 0; } else if (ms < 19) { fastFrames++; slowFrames = Math.max(0, slowFrames - 1); }
    if (slowFrames > 45 && dprCap > 1) { dprCap = Math.max(1, dprCap - 0.5); slowFrames = 0; resize(); }
    else if (fastFrames > 600 && dprCap < 2) { dprCap = Math.min(2, dprCap + 0.5); fastFrames = 0; resize(); }
  }
  if (mode === 'hub') { if (hubTab === 'Battle') drawPreview(now / 1000); return; }   // the hub covers the game: draw only the stage picture
  if (mode === 'title') {
    acc += dt; while (acc >= 1 / 60) { acc -= 1 / 60; step(demo, 1 / 60, botInput(demo)); if (demo.phase === 'levelup') choose(demo, 0); }
    if (demo.phase === 'dead' || demo.phase === 'won') newDemo();
    drain(demo, false); R.draw(demo, null, dt);
    return;
  }
  if (mode === 'play') {
    acc += dt;
    while (acc >= 1 / 60) { acc -= 1 / 60; step(g, 1 / 60, readInput()); if (g.phase === 'levelup' || g.phase === 'dead' || g.phase === 'won') break; }
    if (g.phase === 'levelup' && cardsFor !== g.choices) showCards();
    if (g.phase === 'dead' || g.phase === 'won') { endT += dt; if (endT > (g.phase === 'dead' ? 1.1 : 0.5)) { if (g.phase === 'dead' && g.revivesLeft > 0 && !reviveAsked) showRevive(); else if (!reviveAsked) showResult(); } }
    audio.intensity(g.snakes.length ? Math.min(1, g.stage / 12) : 0);
  }
  if (g) { drain(g, mode === 'play'); R.draw(g, { joy, hints: save.runs < 2 }, mode === 'pause' ? 0 : dt); }
}

// ---------------------------------------------------------------- wiring
$('playBtn').onclick = () => { audio.unlock(); audio.play('click'); if (save.runs === 0) startRun(1); else openHub('Battle'); };
$('resumeBtn').onclick = () => resume();
$('quitBtn').onclick = () => {
  g.p.hp = 0; g.phase = 'dead';
  g.result = { won: false, stage: g.stage, kills: g.kills, coins: Math.floor(g.coins), score: g.score, level: g.level, time: g.t, name: stageInfo(g.stage).name, frags: { ...g.frags } };
  showResult();
};
$('muteBtn').onclick = toggleMute; $('muteBtn').textContent = save.muted ? '🔇' : '🔊';

window.CS = { g: null, save: () => save, mode: () => mode, openHub, startRun };
loadArt('assets/').then(a => {
  art = a; kit = createArtDraw((w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }, 2);
  for (const im of document.querySelectorAll('img[data-cur]')) im.src = iconURL(im.dataset.cur);
  // title decoration: snake heads in four colours
  [['love', 'deco1'], ['grumpy', 'deco2'], ['sneezy', 'deco3'], ['sleepy', 'deco4']].forEach(([skin, el], i) => {
    const c = document.createElement('canvas'); c.width = c.height = 220; kit.drawHead(c.getContext('2d'), 110, 110, 62, i % 2 ? Math.PI : 0, { skin, t: 1 + i, look: [0, 1] }); $(el).src = c.toDataURL();
  });
  R = createRenderer(canvas, art, kit); window.CS.art = art; window.CS.R = R;
  const qs = new URLSearchParams(location.search);
  newDemo(); refreshCur();
  if (qs.get('stage')) { startRun(Math.max(1, +qs.get('stage'))); }   // dev shortcut: ?stage=N
  else show('title');
  last = performance.now(); requestAnimationFrame(frame);
});

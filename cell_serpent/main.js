import { upgradeAllPets as upgradePetsAll, stageKind, isBossStage, skipPick, totalStars, stageMod, claimAllGoals, upgradeAllSkills, hatchAll, exportSave, importSave, keepCanUp, KEEPSAKES, FUND, fundReady, TROPHIES, trophyReady, dealsFor, welcomeReady, W, MAX_STAGE, KIND_LABEL, RING, useInvAttempt, invStage, INV_NAME, power, spendEnergy, tickEnergy, ENERGY_MAX, ENERGY_COST, buyEnergy, reviveGame, reviveCost, recPower, levelInfo, HARD_HP, PETS, PET_MAX_STAR, PET_SLOTS, petCost, petCanUp, petUp, togglePet, hatchEgg, buyEgg, EGG_PRICE, dayLogin, pigTier, usePigAttempt, PIG_NAME, RARITIES, LOADOUT_SIZE, toggleLoadout, dailyGoals, addRunStats, goalProgress, claimGoal, createGame, step, choose, reroll, botInput, buildPath, pointAt, stageInfo, canPlay, clearReward, META, WEAPONS, BOXES, SKILL_MAX_LV, metaCost, skillUpgradeCost, buyMeta, unlockSkill, levelSkill, openBox, applyResult, defaultSave, sanitizeSave } from './sim.js';
import { createHub2 } from './hub2.js';
import { loadArt } from './art.js';
import { createRenderer } from './render.js';
import { createArtDraw } from './art_draw.js';
import { createAudio } from './audio.js';
import { revealStars, countUp, levelBar, reviveRing, stopFx } from './result_fx.js';

const SAVE_KEY = 'cell_serpent_save_v1';   // never rename: it is the live save slot (the save itself is versioned inside)
const $ = id => document.getElementById(id);
const canvas = $('c');
let save = defaultSave();
try { save = sanitizeSave(JSON.parse(localStorage.getItem(SAVE_KEY))); } catch (e) { /* private mode */ }
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } };

const audio = createAudio();
audio.setMuted(save.muted); audio.setMusicAllowed(save.settings.music);
const buzz = p => { try { if (save.settings.vibrate && navigator.vibrate) navigator.vibrate(p); } catch (e) { /* ignore */ } };
function applySettings() { audio.setMuted(save.muted); audio.setMusicAllowed(save.settings.music); if (R) R.setOptions({ reduceMotion: save.settings.reduceMotion, lowQuality: save.settings.lowQuality, bigNumbers: save.settings.bigNumbers }); dprCap = save.settings.lowQuality ? 1 : Math.max(dprCap, 2); }
let art = null, R = null, kit = null;
const dayKey = () => Math.floor(Date.now() / 86400000);
let slowFrames = 0, fastFrames = 0;
let reviveAsked = false, hard = false, mode = 'title', g = null, demo = null, acc = 0, last = 0, endT = 0, cardsFor = null, hubTab = 'Battle', sel = 1, ranResult = false;
const joy = { on: false, id: -1, x: 0, y: 0, dx: 0, dy: 0 };
const keys = {};
sel = Math.max(1, save.last.stage); hard = save.last.hard;

let dprCap = 2;   // lowered automatically on slow phones (dynamic resolution)
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
  canvas.width = Math.round(innerWidth * dpr); canvas.height = Math.round(innerHeight * dpr);
}
addEventListener('resize', resize); resize();

function show(id) { for (const s of document.querySelectorAll('.scr')) s.classList.toggle('on', s.id === id); $('muteBtn').classList.toggle('on', id === 'title' || id === 'pause'); }
function refreshCur() { for (const [id, v] of [['tBeats', save.beats], ['hBeats', save.beats], ['tSpark', save.sparkles], ['hSpark', save.sparkles]]) $(id).textContent = v; const pw = $('hPower'); if (pw) { const li = levelInfo(save.xp); pw.textContent = 'Lv ' + li.lv + '  ·  Power ' + power(save) + (save.streak.n > 1 ? '  ·  🔥 ' + save.streak.n : ''); } const en = $('hEnergy'); if (en) en.textContent = tickEnergy(save, Date.now()) + '/' + ENERGY_MAX; }

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
function tile({ cls = '', ic, name, chip, chipCls = '', desc, bar, barText, pips, btn, gold, disabled, onclick, one, lock }) {
  const t = document.createElement('div'); t.className = 'tile ' + cls + (one ? ' one' : '');
  t.innerHTML = `<div class="top"><div class="ic">${ic}${lock ? `<b class="lk">🔒${lock === true ? '' : `<small>${lock}</small>`}</b>` : ''}</div><div style="min-width:0"><div class="nm">${name}</div>${chip ? `<span class="lv ${chipCls}">${chip}</span>` : ''}</div></div>` +
    `<div class="ds">${desc}</div>` + (bar !== undefined ? `<div class="bar"><i style="width:${bar}%"></i></div><div class="sm">${barText || ''}</div>` : '') + (pips ? `<div class="pips">${pips}</div>` : '') +
    (btn ? `<button class="btn small go ${gold ? 'gold' : ''}" ${disabled ? 'disabled' : ''}>${btn}</button>` : '');
  const b = t.querySelector('button'); if (b && onclick) b.onclick = onclick;
  return t;
}
function loadoutRow(el, link) {
  el.innerHTML = '';
  for (let i = 0; i < LOADOUT_SIZE; i++) {
    const id = save.loadout[i], w = id && WEAPONS.find(x => x.id === id), b = document.createElement('button'); b.className = 'slot' + (id ? ' full tier' + (w ? w.tier || 0 : 0) : '');
    b.innerHTML = id ? icon(id) + (w && save.skills[id] ? `<em class="slv">${save.skills[id].lv}</em>` : '') : '+';
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
  sel = Math.max(1, Math.min(sel, MAX_STAGE, save.cleared + 4));
  renderHub(); show('hub');
}
function badgeTabs() {
  const day = dayKey(), s = save, out = new Set();
  if (welcomeReady(s) || dealsFor(s, day).some((d, i) => !s.shop.bought[i] && d.price === 0) || s.shop.gold !== day) out.add('Shop');
  if (META.some(d => (s.meta[d.id] || 0) < d.max && s.beats >= metaCost(d, s.meta[d.id] || 0))) out.add('Stats');
  if (s.sign.day !== day || FUND.some(f => fundReady(s, f)) || TROPHIES.some(t => trophyReady(s, t)) || dailyGoals(day).some(gl => goalProgress(s, day, gl) >= gl.target && !(s.daily.day === day && s.daily.claimed[gl.id]))) out.add('Battle');
  if (WEAPONS.some(w => { const k = s.skills[w.id]; return k.lv > 0 ? k.lv < SKILL_MAX_LV && k.frag >= skillUpgradeCost(k.lv).frag : k.frag >= w.frag && (s.cleared || 0) >= (w.stage || 0); })) out.add('Skills');
  if (s.eggs > 0 || PETS.some(p => petCanUp(s, p.id))) out.add('Pets');
  if (KEEPSAKES.some(k => keepCanUp(s, k.id))) out.add('Gear');
  return out;
}
function renderHub() {
  refreshCur();
  { const bd = badgeTabs(); for (const b of document.querySelectorAll('.tabs button')) { const has = b.querySelector('.dot'); if (bd.has(b.dataset.tab) && !has) { const d = document.createElement('i'); d.className = 'dot'; b.appendChild(d); } else if (!bd.has(b.dataset.tab) && has) has.remove(); } }
  for (const t of TABS) { $('tab' + t).classList.toggle('on', t === hubTab); }
  for (const b of document.querySelectorAll('.tabs button')) b.classList.toggle('on', b.dataset.tab === hubTab);
  if (hubTab === 'Battle') renderBattle(); else if (hubTab === 'Skills') renderSkills(); else if (hubTab === 'Pets') renderPets(); else if (hubTab === 'Stats') hub2.renderStats(); else if (hubTab === 'Gear') hub2.renderGear(); else hub2.renderShop();
}
for (const b of document.querySelectorAll('.tabs button')) b.onclick = () => { audio.unlock(); audio.play('click'); hubTab = b.dataset.tab; renderHub(); };

function renderBattle() {
  const info = stageInfo(sel), playable = canPlay(save, sel), done = sel <= save.cleared;
  $('stTitle').textContent = `Stage ${sel}: ${info.name}`;
  $('stSub').textContent = `${info.path}${KIND_LABEL[info.kind] ? '  ·  ' + KIND_LABEL[info.kind] : ''}${info.boss ? '  ·  BOSS' : ''}`;
  $('stPrev').disabled = sel <= 1; $('stNext').disabled = sel >= Math.min(MAX_STAGE, save.cleared + 4);
  const chips = $('stChips'); chips.innerHTML = '';
  for (let n = 1; n <= Math.min(MAX_STAGE, save.cleared + 4); n++) {
    const c = document.createElement('button'); c.className = 'chip' + (n === sel ? ' sel' : '') + (n > save.cleared + 1 ? ' lock' : '') + (n <= save.cleared ? ' done' : '');
    { const stN = save.stars[n] || 0, kd = stageKind(n); c.innerHTML = n > save.cleared + 1 ? '🔒' : `${n}<span class="st">${stN ? '★'.repeat(stN) : '&nbsp;'}</span>` + (isBossStage(n) ? '<span class="kk">👑</span>' : kd === 'ring' ? '<span class="kk">🌀</span>' : kd === 'double' ? '<span class="kk">🐍</span>' : ''); }
    c.onclick = () => { audio.play('click'); sel = n; renderBattle(); };
    chips.appendChild(c);
  }
  if (sel > save.cleared) hard = false;
  const hardOk = sel <= save.cleared;
  $('diffRow').innerHTML = `<button class="dbtn ${hard ? '' : 'on'}" data-h="0">Normal</button><button class="dbtn hard ${hard ? 'on' : ''}" data-h="1" ${hardOk ? '' : 'disabled'}>${hardOk ? 'Hard' : '🔒 Hard'}</button><span class="rec">Recommended ${recPower(sel, hard)}</span>`;
  for (const b of $('diffRow').querySelectorAll('.dbtn')) b.onclick = () => { audio.play('click'); hard = b.dataset.h === '1'; renderBattle(); };
  $('stMod').textContent = info.mod ? '✦ ' + info.mod.name + ': ' + info.mod.blurb : '';
  { const nxt = Math.min(MAX_STAGE, save.cleared + 1), cb = $('contBtn'); cb.style.display = sel === nxt || save.cleared >= MAX_STAGE ? 'none' : ''; cb.textContent = 'CONTINUE ▶ STAGE ' + nxt; cb.onclick = () => { audio.play('click'); sel = nxt; hard = false; renderBattle(); }; }
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
$('claimGigs').onclick = () => { audio.play('click'); const n = claimAllGoals(save, dayKey()); if (n) { persist(); audio.play('levelup'); refreshCur(); toast(n + ' reward' + (n > 1 ? 's' : '') + ' claimed'); renderHub(); } else toast('Nothing to claim yet'); };
$('stPrev').onclick = () => { audio.play('click'); sel = Math.max(1, sel - 1); renderBattle(); };
$('stNext').onclick = () => { audio.play('click'); sel = Math.min(MAX_STAGE, save.cleared + 4, sel + 1); renderBattle(); };
$('stGo').onclick = () => { audio.unlock(); audio.play('click'); beginStage(sel); };
$('enPlus').onclick = () => { audio.unlock(); if (buyEnergy(save, Date.now())) { persist(); audio.play('upgrade'); refreshCur(); toast('Voice +10'); } else toast('Not enough Sparkles'); };
// a stage costs Voice; the Piggy Bank Parade is free
function beginStage(stage) {
  if (!spendEnergy(save, Date.now())) { toast('Out of Voice! Rest a bit or grab some tea in the Shop'); openHub('Battle'); return; }
  persist(); startRun(stage);
}

// the stage picture: the lane for this stage with the virus on it
const stCtx = $('stCanvas').getContext('2d');
const W_ = 720;
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
  if (info.kind === 'ring') { c.strokeStyle = 'rgba(255,150,190,.85)'; c.lineWidth = 12; c.beginPath(); c.arc(RING.cx, RING.cy, RING.R, 0, Math.PI * 2); c.stroke(); } else { c.strokeStyle = 'rgba(255,150,190,.8)'; c.lineWidth = 12; c.beginPath(); c.moveTo(0, 1055); c.lineTo(720, 1055); c.stroke(); }
  const head = 700 + Math.sin(t * 1.2) * 60, n = Math.min(info.length, 16);
  for (let i = n - 1; i >= 1; i--) {
    const ps = head - i * 47, a = pointAt(pvPath, ps), b = pointAt(pvPath, ps + 10), kind = info.boss ? true : false;
    const spr = kit.SPR.body(info.skin, kind, ''); if (spr) kit.blit(c, spr, a.x, a.y, 30 * 3.9 * (i > n - 4 ? 0.8 : 1), Math.atan2(b.y - a.y, b.x - a.x));
  }
  if (info.kind === 'double') { for (let i = 9; i >= 1; i--) { const ps = head - 520 - i * 47, a = pointAt(pvPath, ps), b = pointAt(pvPath, ps + 10), spr = kit.SPR.body(info.skin, false, ''); if (spr) kit.blit(c, spr, W_ - a.x, a.y, 30 * 3.9, -Math.atan2(b.y - a.y, b.x - a.x) + Math.PI); } }
  const hp = pointAt(pvPath, head), hp2 = pointAt(pvPath, head + 10);
  kit.drawHead(c, hp.x, hp.y, 38 * (info.boss ? 1.3 : 1) * 1.14, Math.atan2(hp2.y - hp.y, hp2.x - hp.x), { skin: info.skin, boss: info.boss, t, look: [0, 1] });
  const duo = art && art.get('duo_idle'); if (duo) { const dh = 190, dw = dh * duo.width / duo.height; c.drawImage(duo, 360 - dw / 2, (info.kind === 'ring' ? RING.cy - 20 : 1150) - dh * 0.75, dw, dh); }
  c.restore();
}

function renderPig() {
  const el = $('pigBox'); el.innerHTML = '';
  const left = save.pig.left, tier = pigTier(save);
  el.appendChild(hub2.eventTile());
  const gig = save.inv.left;
  el.appendChild(tile({ cls: 't-weapon one', ic: '🐍', name: INV_NAME, chip: 'Stage ' + invStage(save) + '  ·  ' + gig + '/2 today', desc: 'A giant serpent crashes the show. Beat it for ribbons and a little friend.', btn: gig ? 'TAKE THE STAGE' : 'COME BACK TOMORROW', disabled: !gig,
    onclick: () => { audio.unlock(); audio.play('click'); if (!useInvAttempt(save, dayKey())) return; if (!spendEnergy(save, Date.now())) { save.inv.left++; toast('Out of Voice!'); return; } persist(); startRun(invStage(save), 'inv'); } }));
  el.appendChild(tile({ cls: 't-gold one', ic: '🐷', name: PIG_NAME, chip: 'Tier ' + tier + '  ·  ' + left + '/3 today', desc: 'A parade of piggy banks. Shake them hard.', btn: left ? 'JOIN THE PARADE' : 'COME BACK TOMORROW', gold: true, disabled: !left,
    onclick: () => { audio.unlock(); audio.play('click'); if (usePigAttempt(save, dayKey())) { persist(); startRun(tier, 'pig'); } } }));
}
function renderPets() {
  const list = $('petList'); list.innerHTML = '';
  const egg = document.createElement('button'); egg.className = 'eggstage' + (save.eggs > 0 ? ' has' : ''); egg.disabled = save.eggs < 1;
  egg.innerHTML = `<span class="eggpic">${icon('egg')}</span><span class="eggtx"><b>${save.eggs > 0 ? 'TAP THE EGG' : 'NO EGGS YET'}</b><small>${save.eggs > 0 ? 'Something is wiggling inside.' : 'Win stages to find more.'}</small></span><i class="eggn">× ${save.eggs}</i>`;
  egg.onclick = () => {
    if (egg.classList.contains('crack')) return; audio.unlock(); audio.play('click'); egg.classList.add('crack');
    setTimeout(() => {
      const h = hatchEgg(save); if (!h) { egg.classList.remove('crack'); return; } persist(); audio.play('levelup'); refreshCur();
      $('bTitle').textContent = h.beats ? 'JUST SOME SNACKS' : (PETS.find(p => p.id === h.id).name.toUpperCase() + '!');
      $('bLoot').className = 'loot reveal';
      $('bLoot').innerHTML = h.beats ? `<div class="it">${curImg('beats')}<span>+${h.beats}</span></div>` : `<div class="it">${icon(h.id)}<span>+${h.n}</span></div>`;
      $('bOk').onclick = () => { audio.play('click'); $('bLoot').className = 'loot'; $('bOk').onclick = defaultBoxOk; openHub('Pets'); }; show('boxModal');
    }, 650);
  };
  list.appendChild(egg);
  { const rdy = PETS.filter(p => petCanUp(save, p.id)).length; if (save.eggs > 1 || rdy) { const row = document.createElement('div'); row.className = 'refrow'; row.style.justifyContent = 'center'; row.style.gap = '10px'; if (save.eggs > 1) { const b = document.createElement('button'); b.className = 'btn small alt'; b.textContent = 'HATCH ALL (' + save.eggs + ')'; b.onclick = () => { const res = hatchAll(save); if (res.length) { persist(); audio.play('levelup'); refreshCur(); toast(res.length + ' eggs hatched'); renderHub(); } }; row.appendChild(b); } if (rdy) { const b = document.createElement('button'); b.className = 'btn small gold'; b.textContent = 'STAR UP ALL (' + rdy + ')'; b.onclick = () => { if (upgradePetsAll(save)) { persist(); audio.play('upgrade'); renderHub(); } }; row.appendChild(b); } list.appendChild(row); } }
  for (const p of PETS) {
    const k = save.pets[p.id], owned = k.star > 0, maxed = k.star >= PET_MAX_STAR, need = maxed ? 0 : petCost(k.star), eq = save.petEquip.includes(p.id);
    const stars = '★ ' + k.star + '/' + PET_MAX_STAR;
    const starH = Array.from({ length: PET_MAX_STAR }, (_, n) => `<i class="star${n < k.star ? ' on' : ''}">★</i>`).join('');
    const t = tile({ cls: 'coll pet t-weapon' + (eq ? ' on-loadout' : '') + (owned ? '' : ' unowned') + (petCanUp(save, p.id) ? ' ready' : ''), ic: icon(p.id), lock: !owned, name: p.name, chip: owned ? (eq ? 'WALKING' : 'AT HOME') : 'NEW', chipCls: owned ? (eq ? 'eq' : '') : 'lock', desc: p.flavor, pips: starH,
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
  { const rdy = WEAPONS.filter(w => save.skills[w.id].lv > 0 && save.skills[w.id].lv < SKILL_MAX_LV && save.skills[w.id].frag >= skillUpgradeCost(save.skills[w.id].lv).frag).length; if (rdy) { const b = document.createElement('button'); b.className = 'btn small gold sec'; b.style.cssText = 'grid-column:1/-1;margin:2px auto'; b.textContent = 'LEVEL UP ALL READY (' + rdy + ')'; b.onclick = () => { if (upgradeAllSkills(save)) { persist(); audio.play('upgrade'); renderHub(); } }; list.appendChild(b); } }
  const groups = [[], [], []];
  for (const w of WEAPONS) {
    const k = save.skills[w.id], owned = k.lv > 0, eq = save.loadout.includes(w.id);
    let need = 0, can = false, label = '', act = () => false;
    const gated = !owned && (save.cleared || 0) < (w.stage || 0);
    if (!owned) { need = w.frag; can = k.frag >= need && !gated; label = gated ? 'CLEAR STAGE ' + w.stage : 'UNLOCK'; act = () => unlockSkill(save, w.id); }
    else if (k.lv >= SKILL_MAX_LV) label = 'MAX LEVEL';
    else { const c = skillUpgradeCost(k.lv); need = c.frag; can = k.frag >= c.frag; label = can ? 'UPGRADE READY' : 'UPGRADE'; act = () => levelSkill(save, w.id); }
    const ready = can && (!owned || k.lv < SKILL_MAX_LV);
    const pipH = owned ? Array.from({ length: SKILL_MAX_LV }, (_, n) => `<i class="pip${n < k.lv ? ' on' : ''}"></i>`).join('') : '';
    const t = tile({ cls: 'coll t-weapon tier' + (w.tier || 0) + (eq ? ' on-loadout' : '') + (owned ? '' : ' unowned') + (ready ? ' ready' : ''), ic: icon(w.id), lock: !owned && (gated ? 'Stage ' + w.stage : true), name: w.name, chip: owned ? ('Lv ' + k.lv + (eq ? ' ✓' : '')) : (gated ? 'STAGE ' + w.stage : 'LOCKED'), chipCls: owned ? (eq ? 'eq' : '') : 'lock', desc: w.desc, pips: pipH,
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
const hub2 = createHub2({ $, tile, icon, curImg, audio, save: () => save, persist, show, openHub: t => openHub(t), renderHub: () => renderHub(), refreshCur: () => refreshCur(), dayKey, resetBoxOk: () => { $('bOk').onclick = defaultBoxOk; }, bodyURL: skin => { if (!kit) return ''; if (!(('b|' + skin) in iconCache)) { const spr = kit.SPR.body(skin, false, ''); iconCache['b|' + skin] = spr && spr.c.toDataURL ? spr.c.toDataURL() : ''; } return iconCache['b|' + skin]; } });

// ---------------------------------------------------------------- runs
function newDemo() {
  demo = createGame({ seed: (Math.random() * 1e9) | 0, bot: true, stage: 1 + ((Math.random() * 3) | 0) });
  demo.p.hp = demo.p.maxHp = 9999;
  demo.weap = { swab: { lv: 2, cd: 0 }, daggers: { lv: 2, cd: 0 }, dragon: { lv: 1, cd: 0 } }; demo.ups = { notes: 1, aspd: 2 };
}
function startRun(stage, mode2 = '') {
  if (!mode2) save.last = { stage, hard: !!(hard && stage <= save.cleared) };
  audio.unlock(); audio.music(true);
  sel = stage; ranResult = false; endT = 0;
  g = createGame({ seed: (Math.random() * 1e9) | 0, meta: save.meta, skills: skillLevels(), loadout: save.loadout, stage, mode: mode2, hard: hard && !mode2 && stage <= save.cleared, outfit: save.outfits.worn, arts: Object.fromEntries(Object.entries(save.keeps).map(([k, v]) => [k, v.lv])), pets: Object.fromEntries(PETS.map(p => [p.id, save.pets[p.id].star])), petEquip: save.petEquip });
  mode = 'play'; acc = 0; cardsFor = null; reviveAsked = false; show('');
  window.CS.g = g;
}
function refreshTitle() { $('titleInfo').textContent = save.runs ? `Best stage ${save.best || 0}  ·  ★ ${totalStars(save)}  ·  🔥 ${save.streak.n} day${save.streak.n === 1 ? '' : 's'}` : ''; }
function toTitle() { refreshTitle(); mode = 'title'; audio.music(false); refreshCur(); newDemo(); show('title'); }

// ---------------------------------------------------------------- upgrade cards
function showCards() {
  const wrap = $('cards'); wrap.innerHTML = ''; pickLock = false; $('levelup').classList.remove('flashing');
  const top = Math.max(0, ...g.choices.map(c => c.rarity || 0)); $('levelup').dataset.top = top;
  g.choices.forEach((c, i) => {
    const rn = c.rarity || 0, rar = RARITIES[rn], b = document.createElement('button'); b.className = 'card pick c-' + c.kind + ' r' + rn; b.style.setProperty('--d', (i * 0.11 + 0.05).toFixed(2) + 's');
    const have = c.lvl + (c.gain && c.kind === 'weapon' ? c.gain : 1);
    const pips = Array.from({ length: Math.min(c.max, 12) }, (_, k) => `<span class="pip ${k < have ? 'on' : ''}"></span>`).join('');
    const tag = `<span class="rar">${['●', '◆', '▲', '★', '✦', '✹'][rn]} ${rar.name.toUpperCase()}</span>` + (c.isNew ? '<span class="newtag">NEW</span>' : '');
    const dm = c.isNew && c.kind === 'weapon' ? ['', 'New skill', 'Lv 0', 'Lv ' + c.gain] : c.stat && /^(.*?):?\s*([^:→]+?)\s*→\s*(.+)$/.exec(c.stat);
    const stat = dm ? `<div class="delta"><span class="dl">${dm[1]}</span><span class="dv"><i>${dm[2]}</i><em>→</em><b>${dm[3]}</b></span></div>` : c.stat ? `<div class="delta"><span class="dv"><b>${c.stat}</b></span></div>` : '';
    const fx = rn >= 4 ? '<span class="rays"></span>' + Array.from({ length: rn === 5 ? 8 : 5 }, (_, k) => `<span class="pt" style="--x:${(8 + k * (84 / (rn === 5 ? 7 : 4))).toFixed(0)}%;--t:${(1.6 + (k * 0.37) % 1.2).toFixed(2)}s;--w:${((k * 0.29) % 1.5).toFixed(2)}s"></span>`).join('') : '';
    b.innerHTML = `${fx}<span class="key">${i + 1}</span><div class="ic">${icon(c.id)}</div><div class="bd"><div class="nm"><span class="nt">${c.name}</span>${tag}</div><div class="ds">${c.desc}</div>${stat}<div class="pips">${pips}</div></div><span class="shine"></span>`;
    b.onclick = () => pick(i);
    wrap.appendChild(b);
  });
  { const bonus = Math.round((20 + 4 * g.stage) * g.p.coinMul); $('skipBtn').textContent = 'SKIP FOR ' + bonus + ' BEATS'; }
  $('refreshBtn').disabled = g.rerolls <= 0; $('refreshLeft').textContent = `Remaining attempts: ${g.rerolls}/4`;
  cardsFor = g.choices; { let mr = 0; for (const c of g.choices) mr = Math.max(mr, c.rarity || 0); audio.play('card', { rarity: mr }); } show('levelup');
}
let pickLock = false;
function pick(i) {
  if (mode !== 'play' || g.phase !== 'levelup' || pickLock) return;
  audio.play('upgrade');
  const cs = $('cards').children, el = cs[i];
  if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) { choose(g, i); cardsFor = null; if (g.phase !== 'levelup') show(''); return; }
  pickLock = true; el.classList.add('chosen'); [...cs].forEach((c, k) => { if (k !== i) c.classList.add('gone'); }); $('levelup').classList.add('flashing');
  setTimeout(() => { if (!pickLock) return; pickLock = false; if (mode !== 'play' || g.phase !== 'levelup') return; choose(g, i); cardsFor = null; if (g.phase !== 'levelup') show(''); }, 340);
}
$('skipBtn').onclick = () => { if (mode === 'play' && skipPick(g)) { audio.play('skip'); cardsFor = null; if (g.phase === 'levelup') showCards(); else show(''); } };
$('refreshBtn').onclick = () => { if (mode === 'play' && reroll(g)) { audio.play('click'); showCards(); } };

// ---------------------------------------------------------------- input
canvas.addEventListener('pointerdown', e => {
  audio.unlock();
  if (mode !== 'play' || g.phase === 'levelup') return;
  const gp = R.toGame(e.clientX * (canvas.width / innerWidth), e.clientY * (canvas.height / innerHeight));
  if (gp.x > W - 76 && gp.y < 76) { pause(); return; }
  if (gp.x > W - 76 && gp.y >= 76 && gp.y < 150) { showStats(); return; }
  if (g.encore >= 1 && Math.hypot(gp.x - g.p.x, gp.y - g.p.y) < 110) encoreTap = true;   // tap the duo for the Encore blast
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
let encoreTap = false;
function readInput() {
  let mx = joy.dx;
  if (keys.a || keys.arrowleft) mx -= 1; if (keys.d || keys.arrowright) mx += 1;
  const enc = encoreTap || !!keys[' ']; encoreTap = false;
  return { mx, my: 0, encore: enc };
}
function pause() { if (mode !== 'play' || g.phase === 'dead' || g.phase === 'won') return; mode = 'pause'; joy.on = false; joy.dx = joy.dy = 0; show('pause'); }
function resume() { mode = 'play'; show(''); last = performance.now(); }
function openSettings(back) {
  const paint = () => {
    for (const b of document.querySelectorAll('#settings .tgl')) { const k = b.dataset.k, on = k === 'sound' ? !save.muted : save.settings[k]; b.classList.toggle('on', !!on); b.querySelector('b').textContent = on ? 'ON' : 'OFF'; }
    $('bkCode').value = exportSave(save);
  };
  for (const b of document.querySelectorAll('#settings .tgl')) b.onclick = () => {
    const k = b.dataset.k; audio.unlock();
    if (k === 'sound') save.muted = !save.muted; else save.settings[k] = !save.settings[k];
    applySettings(); resize(); persist(); audio.play('click'); $('muteBtn').textContent = save.muted ? '🔇' : '🔊'; paint();
  };
  $('bkCopy').onclick = async () => { const t = $('bkCode').value; try { await navigator.clipboard.writeText(t); toast('Code copied'); } catch (e) { $('bkCode').select(); toast('Select and copy the code'); } };
  $('bkLoad').onclick = () => { const s2 = importSave($('bkCode').value); if (!s2) { toast('That code does not work'); return; } save = s2; persist(); applySettings(); toast('Game loaded'); paint(); };
  $('setClose').onclick = () => { audio.play('click'); (back || (() => (mode === 'hub' ? openHub() : toTitle())))(); };
  paint(); show('settings');
}
function toggleMute() { save.muted = !save.muted; audio.setMuted(save.muted); $('muteBtn').textContent = save.muted ? '🔇' : '🔊'; persist(); }

// ---------------------------------------------------------------- result
function showRevive() {
  reviveAsked = true; const cost = reviveCost(g.revivesUsed);
  $('rvLeft').textContent = 'Remaining ×' + g.revivesLeft; $('rvGo').innerHTML = 'REVIVE  ' + cost + ' ' + curImg('sparkles'); $('rvGo').disabled = save.sparkles < cost;
  let stopRing = () => {};
  $('rvGo').onclick = () => { if (save.sparkles < cost) return; stopRing(); stopFx(); save.sparkles -= cost; persist(); reviveGame(g); reviveAsked = false; endT = 0; audio.play('levelup'); show(''); };
  const giveUp = () => { stopRing(); stopFx(); g.revivesLeft = 0; reviveAsked = false; show(''); };
  $('rvNo').onclick = () => { audio.play('click'); giveUp(); };
  show('revive'); stopRing = reviveRing(10, giveUp);
}
function showStatsFromPause() { statsPanel(() => show('pause')); }
function showStats() {
  if (mode !== 'play') return; mode = 'pause'; joy.on = false; joy.dx = joy.dy = 0;
  statsPanel(() => { mode = 'play'; show(''); last = performance.now(); });
}
function statsPanel(onClose) {
  const tot = Object.values(g.dmgBy).reduce((a, v) => a + v, 0) || 1, rows = Object.entries(g.dmgBy).sort((a, b) => b[1] - a[1]);
  const nm = id => (id === 'capsule' ? 'Singing' : id === 'puppy' ? 'Puppy' : (WEAPONS.find(w => w.id === id) || { name: id }).name);
  hub2.openPanel('WHO DID WHAT', body => {
    body.innerHTML = rows.length ? rows.map(([id, v]) => `<div class="dmgrow"><span class="dn">${id === 'capsule' ? '🎤' : icon(id)} ${nm(id)}</span><div class="bar"><i style="width:${Math.round(v / tot * 100)}%"></i></div><b>${Math.round(v / tot * 100)}%</b></div>`).join('') : '<div class="sub">Nothing popped yet.</div>';
  }, onClose);
}
function showResult() {
  const r = g.result; if (!r || ranResult) return; ranResult = true;
  const li0 = levelInfo(save.xp), out = applyResult(save, r); addRunStats(save, dayKey(), { ...r, kills: r.kills }); persist(); audio.music(false);
  stopFx(); const cu = n => `+<span data-to="${n}">${n}</span>`;
  const rows = [`<div class="r">${curImg('beats')}${cu(out.beats)} Beats</div>`];
  if (out.ribbons) rows.push(`<div class="r">🎀 ${cu(out.ribbons)} Ribbons</div>`);
  if (out.pet) rows.push(`<div class="r">${icon(out.pet.id)}${cu(out.pet.n)} ${PETS.find(p => p.id === out.pet.id).name} fragments</div>`);
  if (out.egg) rows.push(`<div class="r">${icon('egg')}+1 Egg</div>`);
  if (out.sparkles) rows.push(`<div class="r">${curImg('sparkles')}${cu(out.sparkles)} Sparkles</div>`);
  for (const id of Object.keys(out.frags)) rows.push(`<div class="r">${icon(id)}${cu(out.frags[id])} ${WEAPONS.find(w => w.id === id).name} fragment</div>`);
  $('rList').innerHTML = rows.join('');
  $('rTitle').textContent = r.mode === 'inv' ? (r.won ? 'THE GIANT SERPENT BOWS!' : 'THE GIANT SERPENT WON') : r.mode === 'pig' ? (r.won ? 'PIGGY BANKS CRACKED!' : 'THE PIGGIES ESCAPED') : r.won ? 'STAGE CLEAR!' : r.name.toUpperCase() + ' WINS';
  $('rSub').textContent = r.won ? (out.first && r.stage === 1 ? 'Stage select unlocked! Pick any stage you have cleared, or the next one.' : r.name + ' is down.') : `You popped ${r.kills} cells. Spend your Beats in the hub and try again.`;
  if (r.hard) hard = true;
  if (out.levelUps) rows.push(`<div class="r">⭐ Level ${levelInfo(save.xp).lv}!</div>`);
  const li1 = levelInfo(save.xp), reduce = save.settings.reduceMotion;
  levelBar(li0, li1, reduce);
  { const pct = Math.floor((r.progress || 0) * 100), best = out.first || out.starsGained > 0 || (!r.won && !r.mode && !r.hard && pct > out.prevPct && out.prevPct > 0);
    $('rRibbon').textContent = best ? (out.first ? 'FIRST CLEAR!' : out.starsGained > 0 ? 'NEW BEST STARS!' : 'NEW BEST ' + pct + '%') : ''; $('rRibbon').classList.toggle('on', !!best); }
  if (r.cp50) rows.push(`<div class="r">⚡ +10 Voice back</div>`);
  $('rList').innerHTML = rows.join(''); countUp($('rList'), reduce, null);
  const pigRun = r.mode === 'pig' || r.mode === 'inv', nextOk = !pigRun && r.won && canPlay(save, r.stage + 1);
  $('rNext').style.display = nextOk ? '' : 'none'; $('rNext').classList.toggle('pulse', nextOk);
  $('rNext').onclick = () => { audio.play('click'); beginStage(r.stage + 1); };
  $('rRetry').style.display = pigRun ? 'none' : '';
  $('rRetry').onclick = () => { audio.play('click'); beginStage(r.stage); };
  $('rHub').onclick = () => { audio.play('click'); if (!pigRun) sel = r.won ? Math.min(r.stage + 1, save.cleared + 1) : r.stage; openHub('Battle'); };
  { const st = r.stars || 0; $('rStars').innerHTML = r.won && !r.mode && !r.hard ? [1, 2, 3].map(i => `<span class="${i <= st ? '' : 'off'}">★</span>`).join('') : '';
    if ($('rStars').children.length) revealStars($('rStars'), st, i => audio.play('coin', { i }), reduce);
    const mm = Math.floor((r.time || 0) / 60), ss = String(Math.floor((r.time || 0) % 60)).padStart(2, '0');
    const top = Object.entries(r.dmgBy || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => (id === 'capsule' ? 'Singing' : (WEAPONS.find(w => w.id === id) || { name: id }).name)).join(', ') || '-';
    $('rExtra').innerHTML = `<span>Time <b>${mm}:${ss}</b></span><span>Cells <b>${r.kills}</b></span><span>Best groove <b>${r.groove || 0}</b></span><span>Bombs <b>${r.bombs || 0}</b></span><span style="grid-column:1/-1">Top: <b>${top}</b></span>`;
    if (out.starsGained) toast('+' + out.starsGained + ' star' + (out.starsGained > 1 ? 's' : '') + '!' + (out.starBonus ? ' Bonus ' + out.starBonus + ' Sparkles' : ''));
    else if (!r.won && !r.mode && !r.hard && Math.floor((r.progress || 0) * 100) > out.prevPct && out.prevPct > 0) toast('New best: ' + Math.floor(r.progress * 100) + '%'); }
  show('result'); mode = 'over';
}

// ---------------------------------------------------------------- loop
const SFX = { surgewarn: 'swarm', surge: 'roar', won: 'clear', chestdrop: 'power', chest: 'levelup', upgradecell: 'cell', groove: 'groovehit', leak: 'leak', swab: 'meow', needles: 'squeak', dragon: 'coo', maw: 'bark', strike: 'hoot', bubble: 'quack', pulse: 'moo' };
const PETSND = { kitten: 'meow', puppy: 'bark', lamb: 'baa', turtle: 'boop', piglet: 'oink', hamster: 'squeak' };
const BUZZ = { dead: [80, 40, 90], revive: 40, boom: 24, upgradecell: 16, levelup: 14, chest: 12, danger: 28, leak: 60 };
const FX_SOUND = new Set(['shoot', 'hit', 'kill', 'boom', 'coin', 'hurt', 'block', 'power', 'levelup', 'clear', 'stage', 'revive', 'dead', 'swarm', 'roar', 'surgewarn', 'surge', 'won', 'chestdrop', 'chest', 'swab', 'needles', 'dragon', 'maw', 'strike', 'bubble', 'pulse', 'danger', 'mend', 'skip', 'upgradecell', 'groove', 'leak']);
function drain(game, sound) {
  const evs = game.events.splice(0);
  for (const e of evs) {
    R.onEvent(e, game);
    if (!sound) continue;
    if (FX_SOUND.has(e.t)) audio.play(SFX[e.t] || e.t, e); else if (e.t === 'pet') audio.play(PETSND[e.id] || 'chirp');
    if (BUZZ[e.t] !== undefined) buzz(BUZZ[e.t]);
  }
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000 || 0); last = now;
  if (!R) return;
  if (mode === 'play') {
    const ms = dt * 1000;
    if (ms > 26) { slowFrames++; fastFrames = 0; } else if (ms < 19) { fastFrames++; slowFrames = Math.max(0, slowFrames - 1); }
    if (slowFrames > 45 && dprCap > 1) { dprCap = Math.max(1, dprCap - 0.5); slowFrames = 0; resize(); }
    else if (slowFrames > 90 && dprCap <= 1 && !save.settings.lowQuality) { save.settings.lowQuality = true; R.setOptions({ lowQuality: true }); toast('Low quality turned on to keep it smooth'); persist(); }
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
    acc += dt * R.timeScale();   // slow motion on the last cell / boss face
    while (acc >= 1 / 60) { acc -= 1 / 60; step(g, 1 / 60, readInput()); if (g.phase === 'levelup' || g.phase === 'dead' || g.phase === 'won') break; }
    if (g.phase === 'levelup' && cardsFor !== g.choices) showCards();
    if (g.phase === 'dead' || g.phase === 'won') { endT += dt; if (endT > (g.phase === 'dead' ? 1.1 : 0.5)) { if (g.phase === 'dead' && g.revivesLeft > 0 && !reviveAsked) showRevive(); else if (!reviveAsked) showResult(); } }
    audio.intensity(g.snakes.length ? Math.min(1, g.stage / 12) : 0); audio.mix({ stage: g.stage, boss: isBossStage(g.stage), groove: g.groove / 20, danger: g.danger });
  }
  if (g) { drain(g, mode === 'play'); R.draw(g, { joy, hints: save.runs < 2 }, mode === 'pause' ? 0 : dt); }
}

// ---------------------------------------------------------------- wiring
$('playBtn').onclick = () => { audio.unlock(); audio.play('click'); if (save.runs === 0) startRun(1); else openHub('Battle'); };
$('resumeBtn').onclick = () => resume();
$('pStats').onclick = () => { audio.play('click'); showStatsFromPause(); };
$('pSet').onclick = () => { audio.play('click'); openSettings(() => show('pause')); };
$('quitBtn').onclick = () => {
  g.p.hp = 0; g.phase = 'dead';
  g.result = { won: false, stage: g.stage, kills: g.kills, coins: Math.floor(g.coins), score: g.score, level: g.level, time: g.t, name: stageInfo(g.stage).name, frags: { ...g.frags } };
  showResult();
};
$('setBtnT').onclick = () => { audio.unlock(); audio.play('click'); openSettings(() => toTitle()); };
$('setBtnH').onclick = () => { audio.unlock(); audio.play('click'); openSettings(() => openHub()); };
$('muteBtn').onclick = toggleMute;
for (const [id, label] of [['muteBtn', 'Mute'], ['enPlus', 'Buy Voice'], ['stPrev', 'Previous stage'], ['stNext', 'Next stage']]) $(id).setAttribute('aria-label', label);
addEventListener('error', () => { toast('Something glitched. Your save is safe.'); if (mode === 'play') pause(); }); $('muteBtn').textContent = save.muted ? '🔇' : '🔊';

window.CS = { g: null, save: () => save, mode: () => mode, openHub, startRun };
loadArt('assets/').then(a => {
  art = a; kit = createArtDraw((w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }, 2);
  for (const im of document.querySelectorAll('img[data-cur]')) im.src = iconURL(im.dataset.cur);
  // title decoration: snake heads in four colours
  [['love', 'deco1'], ['grumpy', 'deco2'], ['sneezy', 'deco3'], ['sleepy', 'deco4']].forEach(([skin, el], i) => {
    const c = document.createElement('canvas'); c.width = c.height = 220; kit.drawHead(c.getContext('2d'), 110, 110, 62, i % 2 ? Math.PI : 0, { skin, t: 1 + i, look: [0, 1] }); $(el).src = c.toDataURL();
  });
  R = createRenderer(canvas, art, kit); window.CS.art = art; window.CS.R = R; applySettings(); resize(); refreshTitle();
  const qs = new URLSearchParams(location.search);
  newDemo(); refreshCur();
  if (qs.get('stage')) { startRun(Math.max(1, +qs.get('stage'))); }   // dev shortcut: ?stage=N
  else show('title');
  last = performance.now(); requestAnimationFrame(frame);
});

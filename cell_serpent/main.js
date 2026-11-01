import { W, createGame, step, choose, reroll, botInput, buildPath, pointAt, stageInfo, canPlay, clearReward, META, WEAPONS, BOXES, SKILL_MAX_LV, metaCost, skillUpgradeCost, buyMeta, unlockSkill, levelSkill, openBox, applyResult, defaultSave, sanitizeSave } from './sim.js';
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
let mode = 'title', g = null, demo = null, acc = 0, last = 0, endT = 0, cardsFor = null, hubTab = 'Battle', sel = 1, ranResult = false;
const joy = { on: false, id: -1, x: 0, y: 0, dx: 0, dy: 0 };
const keys = {};

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(innerWidth * dpr); canvas.height = Math.round(innerHeight * dpr);
}
addEventListener('resize', resize); resize();

function show(id) { for (const s of document.querySelectorAll('.scr')) s.classList.toggle('on', s.id === id); $('muteBtn').classList.toggle('on', id === 'title' || id === 'pause'); }
function refreshCur() { for (const [id, v] of [['tBeats', save.beats], ['hBeats', save.beats], ['tSpark', save.sparkles], ['hSpark', save.sparkles]]) $(id).textContent = v; }

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
    else if (id === 'boxbeat' || id === 'boxspark') spr = kit.SPR.pickup(id);
    else if (WEAPONS.some(w => w.id === id)) spr = kit.SPR.weapon(WICON[id] || id);
  }
  return (iconCache[id] = spr && spr.c.toDataURL ? spr.c.toDataURL() : '');
}
const icon = id => (iconURL(id) ? `<img ${WEAPONS.some(w => w.id === id) || id === 'maw' ? 'class="zoom" ' : ''}src="${iconURL(id)}" alt="">` : (id[0] || '?').toUpperCase());
const curImg = c => `<img src="${iconURL(c)}" alt="" style="width:22px;height:22px;vertical-align:middle">`;
const skillLevels = () => Object.fromEntries(Object.entries(save.skills).map(([id, k]) => [id, k.lv]));

// ---------------------------------------------------------------- hub
const TABS = ['Battle', 'Skills', 'Stats', 'Shop'];
function openHub(tab = hubTab) {
  mode = 'hub'; hubTab = tab; audio.music(false); refreshCur();
  sel = Math.max(1, Math.min(sel, save.cleared + 4));
  renderHub(); show('hub');
}
function renderHub() {
  refreshCur();
  for (const t of TABS) { $('tab' + t).classList.toggle('on', t === hubTab); }
  for (const b of document.querySelectorAll('.tabs button')) b.classList.toggle('on', b.dataset.tab === hubTab);
  if (hubTab === 'Battle') renderBattle(); else if (hubTab === 'Skills') renderSkills(); else if (hubTab === 'Stats') renderStats(); else renderShop();
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
  const first = !done ? `<span>First clear <b>${curImg('sparkles')} ${clearReward(sel).sparkles}</b></span>` : '<span><b>Cleared ✓</b></span>';
  $('stInfo').innerHTML = `<span>Cells <b>${info.length}</b></span><span>Cell HP <b>${Math.round(info.hp / 10) * 10 >= 1000 ? (info.hp / 1000).toFixed(1) + 'k' : info.hp}</b></span>${first}`;
  const go = $('stGo'); go.disabled = !playable; go.textContent = playable ? 'START THE BATTLE' : `CLEAR STAGE ${save.cleared + 1} FIRST`;
  const chip = chips.querySelector('.sel'); if (chip && chip.scrollIntoView) { try { chips.scrollTo({ left: chip.offsetLeft - 120 }); } catch (e) { /* ignore */ } }
}
$('stPrev').onclick = () => { audio.play('click'); sel = Math.max(1, sel - 1); renderBattle(); };
$('stNext').onclick = () => { audio.play('click'); sel = Math.min(save.cleared + 4, sel + 1); renderBattle(); };
$('stGo').onclick = () => { audio.unlock(); audio.play('click'); startRun(sel); };

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

function renderSkills() {
  const list = $('skillList'); list.innerHTML = '';
  for (const w of WEAPONS) {
    const k = save.skills[w.id], owned = k.lv > 0;
    const card = document.createElement('div'); card.className = 'card c-weapon'; card.style.cursor = 'default';
    let need, can, label, act;
    if (!owned) { need = w.frag; can = k.frag >= need; label = 'UNLOCK'; act = () => unlockSkill(save, w.id); }
    else if (k.lv >= SKILL_MAX_LV) { need = 0; can = false; label = 'MAX'; act = () => false; }
    else { const c = skillUpgradeCost(k.lv); need = c.frag; can = k.frag >= c.frag && save.beats >= c.beats; label = `UPGRADE ${c.beats}`; act = () => levelSkill(save, w.id); }
    const pct = need ? Math.min(100, Math.round((k.frag / need) * 100)) : 100;
    card.innerHTML = `<div class="ic">${icon(w.id)}</div><div style="flex:1;min-width:0"><div class="nm">${w.name} ${owned ? `<span style="color:#ffd84d;font-size:14px">Lv ${k.lv}</span>` : '<span style="color:#ff9ad6;font-size:14px">LOCKED</span>'}</div><div class="ds">${w.desc}</div><div class="bar" style="margin-top:6px"><i style="width:${pct}%"></i></div><div class="ds">${need ? `Fragments ${k.frag} / ${need}` : 'Fully upgraded'}</div></div><div class="end"><button class="btn small" ${can ? '' : 'disabled'}>${label}${owned && k.lv < SKILL_MAX_LV ? ' ' : ''}${owned && k.lv < SKILL_MAX_LV ? curImg('beats') : ''}</button></div>`;
    card.querySelector('button').onclick = () => { if (act()) { persist(); audio.unlock(); audio.play('upgrade'); renderHub(); } };
    list.appendChild(card);
  }
}
function renderStats() {
  const list = $('statList'); list.innerHTML = '';
  for (const d of META) {
    const lvl = save.meta[d.id] || 0, maxed = lvl >= d.max, cost = metaCost(d, lvl);
    const b = document.createElement('div'); b.className = 'card c-capsule'; b.style.cursor = 'default';
    const pips = Array.from({ length: Math.min(d.max, 12) }, (_, i) => `<span class="pip ${i < lvl ? 'on' : ''}"></span>`).join('');
    b.innerHTML = `<div class="ic">${d.name[0]}</div><div style="flex:1"><div class="nm">${d.name} <span style="color:#ffd84d;font-size:14px">Lv ${lvl}</span></div><div class="ds">${d.desc(Math.max(1, maxed ? lvl : lvl + 1))}${maxed ? '' : ' (next)'}</div><div class="pips">${pips}</div></div><div class="end"><button class="btn small" ${maxed || save.beats < cost ? 'disabled' : ''}>${maxed ? 'MAX' : cost + ' ' + curImg('beats')}</button></div>`;
    b.querySelector('button').onclick = () => { if (buyMeta(save, d.id)) { persist(); audio.unlock(); audio.play('upgrade'); renderHub(); } };
    list.appendChild(b);
  }
}
function renderShop() {
  const list = $('boxList'); list.innerHTML = '';
  for (const b of BOXES) {
    const can = save[b.cur] >= b.price, card = document.createElement('div'); card.className = 'card ' + (b.id === 'spark' ? 'c-passive' : 'c-weapon'); card.style.cursor = 'default';
    card.innerHTML = `<div class="ic" style="width:72px;height:72px">${icon(b.id === 'spark' ? 'boxspark' : 'boxbeat')}</div><div style="flex:1"><div class="nm">${b.name}</div><div class="ds">${b.desc}</div></div><div class="end"><button class="btn ${b.id === 'spark' ? 'gold' : ''} small" ${can ? '' : 'disabled'}>${b.price} ${curImg(b.cur)}</button></div>`;
    card.querySelector('button').onclick = () => {
      audio.unlock();
      const got = openBox(save, b.id); if (!got) return;
      persist(); audio.play('levelup'); refreshCur();
      $('bTitle').textContent = b.name.toUpperCase() + ' OPENED!';
      $('bLoot').innerHTML = got.map((x, i) => `<div class="it" style="animation-delay:${i * 0.12}s">${icon(x.id)}<span>+${x.n}</span><small>${WEAPONS.find(w => w.id === x.id).name}</small></div>`).join('');
      show('boxModal'); renderShop();
    };
    list.appendChild(card);
  }
}
$('bOk').onclick = () => { audio.play('click'); openHub('Shop'); };

// ---------------------------------------------------------------- runs
function newDemo() {
  demo = createGame({ seed: (Math.random() * 1e9) | 0, bot: true, stage: 1 + ((Math.random() * 3) | 0) });
  demo.p.hp = demo.p.maxHp = 9999;
  demo.weap = { swab: { lv: 2, cd: 0 }, daggers: { lv: 2, cd: 0 }, dragon: { lv: 1, cd: 0 } }; demo.ups = { notes: 1, aspd: 2 };
}
function startRun(stage) {
  audio.unlock(); audio.music(true);
  sel = stage; ranResult = false; endT = 0;
  g = createGame({ seed: (Math.random() * 1e9) | 0, meta: save.meta, skills: skillLevels(), stage });
  mode = 'play'; acc = 0; cardsFor = null; show('');
  window.CS.g = g;
}
function toTitle() { mode = 'title'; audio.music(false); refreshCur(); newDemo(); show('title'); }

// ---------------------------------------------------------------- upgrade cards
function showCards() {
  const wrap = $('cards'); wrap.innerHTML = '';
  g.choices.forEach((c, i) => {
    const b = document.createElement('button'); b.className = 'card pick c-' + c.kind;
    const pips = Array.from({ length: c.max }, (_, k) => `<span class="pip ${k <= c.lvl ? 'on' : ''}"></span>`).join('');
    const tag = c.isNew ? '<span style="color:#9dff6d;font-size:13px"> NEW</span>' : `<span style="color:#ffd84d;font-size:13px"> Lv ${c.lvl} → ${c.lvl + 1}</span>`;
    b.innerHTML = `<div class="ic">${icon(c.id)}</div><div><div class="nm">${c.name}${tag}</div><div class="ds">${c.desc}</div><div class="pips">${pips}</div></div>`;
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
function showResult() {
  const r = g.result; if (!r || ranResult) return; ranResult = true;
  const out = applyResult(save, r); persist(); audio.music(false);
  const rows = [`<div class="r">${curImg('beats')}+${out.beats} Beats</div>`];
  if (out.sparkles) rows.push(`<div class="r">${curImg('sparkles')}+${out.sparkles} Sparkles (first clear)</div>`);
  for (const id of Object.keys(out.frags)) rows.push(`<div class="r">${icon(id)}+${out.frags[id]} ${WEAPONS.find(w => w.id === id).name} fragment</div>`);
  $('rList').innerHTML = rows.join('');
  $('rTitle').textContent = r.won ? 'STAGE CLEAR!' : r.name.toUpperCase() + ' WINS';
  $('rSub').textContent = r.won ? (out.first && r.stage === 1 ? 'Stage select unlocked! Pick any stage you have cleared, or the next one.' : r.name + ' is down.') : `You popped ${r.kills} cells. Spend your Beats in the hub and try again.`;
  const nextOk = r.won && canPlay(save, r.stage + 1);
  $('rNext').style.display = nextOk ? '' : 'none';
  $('rNext').onclick = () => { audio.play('click'); startRun(r.stage + 1); };
  $('rRetry').onclick = () => { audio.play('click'); startRun(r.stage); };
  $('rHub').onclick = () => { audio.play('click'); sel = r.won ? Math.min(r.stage + 1, save.cleared + 1) : r.stage; openHub('Battle'); };
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
  if (mode === 'title' || mode === 'hub') {
    acc += dt; while (acc >= 1 / 60) { acc -= 1 / 60; step(demo, 1 / 60, botInput(demo)); if (demo.phase === 'levelup') choose(demo, 0); }
    if (demo.phase === 'dead' || demo.phase === 'won') newDemo();
    drain(demo, false); R.draw(demo, null, dt);
    if (mode === 'hub' && hubTab === 'Battle') drawPreview(now / 1000);
    return;
  }
  if (mode === 'play') {
    acc += dt;
    while (acc >= 1 / 60) { acc -= 1 / 60; step(g, 1 / 60, readInput()); if (g.phase === 'levelup' || g.phase === 'dead' || g.phase === 'won') break; }
    if (g.phase === 'levelup' && cardsFor !== g.choices) showCards();
    if (g.phase === 'dead' || g.phase === 'won') { endT += dt; if (endT > (g.phase === 'dead' ? 1.1 : 0.5)) showResult(); }
    audio.intensity(g.snakes.length ? Math.min(1, g.stage / 12) : 0);
  }
  if (g) { drain(g, mode === 'play'); R.draw(g, { joy }, mode === 'pause' ? 0 : dt); }
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
  [['pink', 'deco1'], ['purple', 'deco2'], ['mint', 'deco3'], ['sun', 'deco4']].forEach(([skin, el], i) => {
    const c = document.createElement('canvas'); c.width = c.height = 220; kit.drawHead(c.getContext('2d'), 110, 110, 62, i % 2 ? Math.PI : 0, { skin, t: 1 + i, look: [0, 1] }); $(el).src = c.toDataURL();
  });
  R = createRenderer(canvas, art, kit); window.CS.art = art; window.CS.R = R;
  const qs = new URLSearchParams(location.search);
  newDemo(); refreshCur();
  if (qs.get('stage')) { startRun(Math.max(1, +qs.get('stage'))); }   // dev shortcut: ?stage=N
  else show('title');
  last = performance.now(); requestAnimationFrame(frame);
});

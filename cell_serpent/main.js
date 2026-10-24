import { W, H, createGame, step, choose, botInput, META, metaCost, buyMeta, defaultSave, sanitizeSave } from './sim.js';
import { loadArt } from './art.js';
import { createRenderer } from './render.js';
import { createAudio } from './audio.js';

const SAVE_KEY = 'cell_serpent_save_v1';
const $ = id => document.getElementById(id);
const canvas = $('c');
let save = defaultSave();
try { save = sanitizeSave(JSON.parse(localStorage.getItem(SAVE_KEY))); } catch (e) { /* private mode */ }
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } };

const audio = createAudio();
audio.setMuted(save.muted);
let art = null, R = null;
let mode = 'title', g = null, demo = null, acc = 0, last = 0, overT = 0, cardsFor = null;
const joy = { on: false, id: -1, x: 0, y: 0, dx: 0, dy: 0 };
const keys = {};

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(innerWidth * dpr); canvas.height = Math.round(innerHeight * dpr);
}
addEventListener('resize', resize); resize();

function show(id) { for (const s of document.querySelectorAll('.scr')) s.classList.toggle('on', s.id === id); $('muteBtn').classList.toggle('on', id === 'title' || id === 'pause'); }
function refreshTitle() { $('bestStat').textContent = save.best; $('runStat').textContent = save.runs; $('coinStat').textContent = save.coins; }

function newDemo() { demo = createGame({ seed: (Math.random() * 1e9) | 0, bot: true, stage: 1 + ((Math.random() * 4) | 0) }); demo.p.hp = demo.p.maxHp = 400; }
function startRun() {
  audio.unlock(); audio.music(true);
  const qs = new URLSearchParams(location.search);
  g = createGame({ seed: (Math.random() * 1e9) | 0, meta: save.meta, stage: Math.max(1, +qs.get('stage') || 1) });
  mode = 'play'; acc = 0; cardsFor = null; show('');
  window.CS.g = g;
}
function toTitle() { mode = 'title'; audio.music(false); refreshTitle(); newDemo(); show('title'); }

// ---------------------------------------------------------------- shop
function renderShop() {
  $('shopCoins').textContent = save.coins;
  const list = $('shopList'); list.innerHTML = '';
  for (const d of META) {
    const lvl = save.meta[d.id] || 0, maxed = lvl >= d.max, cost = metaCost(d, lvl);
    const b = document.createElement('button'); b.className = 'card'; b.disabled = maxed || save.coins < cost;
    const pips = Array.from({ length: Math.min(d.max, 12) }, (_, i) => `<span class="pip ${i < lvl ? 'on' : ''}"></span>`).join('');
    b.innerHTML = `<div class="ic" style="background:#ff7ac6">${d.name[0]}</div><div><div class="nm">${d.name}</div><div class="ds">${d.desc(Math.max(1, maxed ? lvl : lvl + 1))}${maxed ? '' : ' (next)'}</div><div class="pips">${pips}</div></div><div class="cost">${maxed ? 'MAX' : cost + ' 🪙'}</div>`;
    b.onclick = () => { if (buyMeta(save, d.id)) { persist(); audio.unlock(); audio.play('upgrade'); renderShop(); } };
    list.appendChild(b);
  }
}

// ---------------------------------------------------------------- level-up cards
const UP_COL = { dmg: '#ff7a6a', rate: '#ffd24a', multi: '#9dff6d', pierce: '#6fe3ff', crit: '#ffe14a', speed: '#b6a2ff', hp: '#ff6a8a', magnet: '#6fe3ff', orbit: '#7dff5e', splash: '#a0ff5e', regen: '#ff8ab0', slow: '#8fe8ff', homing: '#ffb36a' };
function showCards() {
  const wrap = $('cards'); wrap.innerHTML = '';
  g.choices.forEach((c, i) => {
    const b = document.createElement('button'); b.className = 'card';
    const pips = Array.from({ length: c.max }, (_, k) => `<span class="pip ${k <= c.lvl ? 'on' : ''}"></span>`).join('');
    b.innerHTML = `<div class="ic" style="background:${UP_COL[c.id] || '#fff'}">${i + 1}</div><div><div class="nm">${c.name}</div><div class="ds">${c.desc}</div><div class="pips">${pips}</div></div>`;
    b.onclick = () => pick(i);
    wrap.appendChild(b);
  });
  cardsFor = g.choices; show('levelup');
}
function pick(i) { if (mode !== 'play' || g.phase !== 'levelup') return; audio.play('upgrade'); choose(g, i); cardsFor = null; if (g.phase !== 'levelup') show(''); }

// ---------------------------------------------------------------- input
function gamePt(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, k: canvas.width / r.width }; }
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
  let dx = (e.clientX - joy.sx) / rad, dy = (e.clientY - joy.sy) / rad; const l = Math.hypot(dx, dy);
  if (l > 1) { dx /= l; dy /= l; joy.sx = e.clientX - dx * rad; joy.sy = e.clientY - dy * rad; }   // anchor follows the finger
  const gp = R.toGame(joy.sx * dpr, joy.sy * dpr); joy.x = gp.x; joy.y = gp.y;
  joy.dx = dx; joy.dy = dy;
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
  let mx = joy.dx, my = joy.dy;
  if (keys.a || keys.arrowleft) mx -= 1; if (keys.d || keys.arrowright) mx += 1;
  if (keys.w || keys.arrowup) my -= 1; if (keys.s || keys.arrowdown) my += 1;
  return { mx, my };
}
function pause() { if (mode !== 'play' || g.phase === 'dead') return; mode = 'pause'; joy.on = false; joy.dx = joy.dy = 0; show('pause'); }
function resume() { mode = 'play'; show(''); last = performance.now(); }
function toggleMute() { save.muted = !save.muted; audio.setMuted(save.muted); $('muteBtn').textContent = save.muted ? '🔇' : '🔊'; persist(); }

// ---------------------------------------------------------------- run end
function finishRun() {
  const r = g.result; if (!r || g.saved) return; g.saved = true;
  const newBest = r.stage > save.best;
  save.coins += r.coins; save.runs++; save.kills += r.kills; if (newBest) save.best = r.stage; persist();
  $('oStage').textContent = r.stage; $('oBest').textContent = newBest ? 'NEW BEST!' : '';
  $('oKills').textContent = r.kills; $('oLevel').textContent = r.level; $('oScore').textContent = r.score; $('oCoins').textContent = r.coins;
  $('overTitle').textContent = r.boss ? 'THE BOSS WINS' : 'THE SERPENT WINS';
  show('over');
}

// ---------------------------------------------------------------- loop
const FX_SOUND = new Set(['shoot', 'hit', 'kill', 'boom', 'split', 'gem', 'coin', 'hurt', 'block', 'power', 'levelup', 'spit', 'roar', 'clear', 'stage', 'swarm', 'revive', 'dead']);
function drain(game, sound) {
  const evs = game.events.splice(0);
  for (const e of evs) { R.onEvent(e, game); if (sound && FX_SOUND.has(e.t)) audio.play(e.t, e); }
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000 || 0); last = now;
  if (!R) return;
  if (mode === 'title' || mode === 'shop') {
    acc += dt; while (acc >= 1 / 60) { acc -= 1 / 60; step(demo, 1 / 60, botInput(demo)); if (demo.phase === 'levelup') choose(demo, 0); }
    if (demo.phase === 'dead' || demo.stage > 7) newDemo();
    drain(demo, false); R.draw(demo, null, dt); return;
  }
  if (mode === 'play') {
    acc += dt;
    while (acc >= 1 / 60) { acc -= 1 / 60; step(g, 1 / 60, readInput()); if (g.phase === 'levelup' || g.phase === 'dead') break; }
    if (g.phase === 'levelup' && cardsFor !== g.choices) showCards();
    if (g.phase === 'dead') { overT += dt; if (overT > 1.1) { overT = 0; finishRun(); mode = 'over'; audio.music(false); } }
    audio.intensity(g.snakes.length ? Math.min(1, g.stage / 12) : 0);
  }
  if (g) { drain(g, mode === 'play'); R.draw(g, { joy }, mode === 'pause' ? 0 : dt); }
}

// ---------------------------------------------------------------- wiring
$('playBtn').onclick = () => { audio.unlock(); audio.play('click'); startRun(); };
$('againBtn').onclick = () => { audio.play('click'); startRun(); };
$('shopBtn').onclick = () => { audio.unlock(); audio.play('click'); mode = 'shop'; renderShop(); show('shop'); };
$('overShop').onclick = () => { mode = 'shop'; renderShop(); show('shop'); };
$('shopBack').onclick = () => { audio.play('click'); toTitle(); };
$('overMenu').onclick = () => toTitle();
$('resumeBtn').onclick = () => resume();
$('quitBtn').onclick = () => { g.p.hp = 0; g.phase = 'dead'; g.result = { stage: g.stage, kills: g.kills, coins: Math.floor(g.coins), score: g.score, level: g.level, time: g.t, boss: false }; finishRun(); mode = 'over'; audio.music(false); };
$('muteBtn').onclick = toggleMute; $('muteBtn').textContent = save.muted ? '🔇' : '🔊';

window.CS = { g: null, save: () => save, mode: () => mode };
loadArt('assets/').then(a => {
  art = a; R = createRenderer(canvas, art); window.CS.art = art; window.CS.R = R;
  newDemo(); refreshTitle(); show('title'); last = performance.now(); requestAnimationFrame(frame);
});

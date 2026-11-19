// Million To One: the page. Input, game loop, menus, juice.
import { Race, newMeta, loadMeta, buyHabit, lv, idleTick, collectBank, factoryRate, SAVE_KEY, VIEW_W, zoneIndex, ZSTART } from './core.js';
import { ZONES, RACE_LEN, MUTATIONS, HABITS, HABIT_ORDER, habitCost, COMBO_WORDS, DEATH_LINES, INTRO, PX_PER_CM, RIVALS, TOTAL_SWIMMERS } from './content.js';
import { Renderer } from './render.js';
import { Audio } from './audio.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const cv = $('cv'), R = new Renderer(cv), A = new Audio();

let meta = newMeta();
try { meta = loadMeta(JSON.parse(localStorage.getItem(SAVE_KEY) || 'null')); } catch (e) { /* private mode */ }
const save = () => { try { meta.lastSeen = Date.now(); localStorage.setItem(SAVE_KEY, JSON.stringify(meta)); } catch (e) { /* ignore */ } };
A.setMuted(meta.muted); $('muteChk').checked = meta.muted;

let race = null, mode = 'title', timeScale = 1, slowT = 0, shownRank = TOTAL_SWIMMERS, hintT = 0;
window.game = { get race() { return race; }, get meta() { return meta; } };

// a demo race runs behind the title screen
function demo() { race = new Race(newMeta(), Math.random, { autopilot: true }); race.demo = true; R.camY = null; }

function show(id) { for (const o of ['title', 'intro', 'cards', 'result', 'shop', 'album', 'pause']) $(o).classList.toggle('hide', o !== id); }
function hud(on) { for (const id of ['hud', 'dashBtn', 'pauseBtn']) $(id).classList.toggle('hide', !on); if (!on) { $('combo').style.opacity = 0; $('drillUI').classList.add('hide'); } }

// ------------------------------------------------------------------ title
function title() {
  mode = 'title'; demo(); hud(false); show('title');
  idleTick(meta, Date.now()); save();
  $('titleStats').innerHTML = `<div class="stat"><b>${meta.best >= TOTAL_SWIMMERS ? '-' : '#' + fmt(meta.best)}</b>best place</div><div class="stat"><b>${fmt(meta.dna)}</b>DNA 🧬</div><div class="stat"><b>${meta.gen + 1}</b>generation</div><div class="stat"><b>${meta.babies.length}</b>babies</div>`;
  const bank = Math.floor(meta.bank);
  $('bankBox').classList.toggle('hide', bank < 1);
  if (bank >= 1) $('bankBox').innerHTML = `🏭 While you were away, Dad's factory made <b>${fmt(bank)} DNA</b> (${factoryRate(meta)}/hour)<br><button class="btn gold" id="bankBtn" style="margin:6px auto 0;font-size:16px;padding:8px">Collect</button>`;
  const bb = $('bankBtn'); if (bb) bb.onclick = () => { const d = collectBank(meta); A.unlock(); A.sfx('dna'); save(); title(); R.pop(VIEW_W / 2, race.p.y + 200, '+' + d + ' DNA', '#7dffb0', 26); };
  $('autoWrap').classList.toggle('hide', !lv(meta, 'gps')); $('autoChk').checked = meta.autopilot;
}

// ------------------------------------------------------------------ intro story
function intro(done) {
  show('intro'); let i = 0;
  const next = () => {
    if (i >= INTRO.length) { $('intro').onclick = null; meta.introSeen = true; save(); done(); return; }
    const t = INTRO[i++]; $('introTxt').textContent = t; $('introTxt').classList.toggle('big', t === 'SWIM.' || t === 'Dead last.');
    A.sfx('tap');
  };
  $('intro').onclick = next; next();
}

// ------------------------------------------------------------------ run
function start() {
  A.unlock(); A.on = true;
  race = new Race(meta, Math.random, { autopilot: meta.autopilot && lv(meta, 'gps') > 0 });
  R.camY = null; R.parts = []; R.pops = []; shownRank = race.rank;
  mode = 'race'; show(null); hud(true);
  banner(ZONES[0].name, 'ZONE 1', ZONES[0].coach);
  hint(race.autopilot ? 'Autopilot is ON. Sit back. Tap DASH if you like.' : 'Drag to steer. Tuck in behind rivals to draft. Double tap or DASH to burst.', 5);
}
let bannerT = 0;
function banner(t, z, c) {
  $('banner').querySelector('.t').textContent = t; $('banner').querySelector('.z').textContent = z || ''; $('banner').querySelector('.c').textContent = c || '';
  $('banner').querySelector('.c').style.display = c ? '' : 'none';
  $('banner').classList.add('on'); bannerT = c ? 4.2 : 1.6;
}
function hint(t, sec = 3) { $('hint').textContent = t; $('hint').style.opacity = 1; hintT = sec; }

// ------------------------------------------------------------------ input
let drag = null, lastDown = 0;
const toWorldX = (clientX) => { const r = cv.getBoundingClientRect(); return (clientX - r.left) / r.width * VIEW_W; };
cv.addEventListener('pointerdown', (e) => {
  A.unlock();
  if (mode !== 'race' || !race) return;
  if (race.drill) { race.input.tap++; A.sfx('drill', race.input.tap); R.burst(race.p.x, race.p.y + 20, '#5ce1ff', 4, 160, 0.3, 2); R.shake = Math.max(R.shake, 3); return; }
  const now = performance.now();
  if (now - lastDown < 280) race.input.dash = true;
  lastDown = now;
  drag = { id: e.pointerId, sx: toWorldX(e.clientX), px: race.p.x };
  race.input.tx = race.p.x;
  if (race.autopilot) { race.autopilot = false; hint('Autopilot off. You are driving!', 2); }
});
cv.addEventListener('pointermove', (e) => { if (drag && e.pointerId === drag.id && race) race.input.tx = drag.px + (toWorldX(e.clientX) - drag.sx) * 1.35; });
const up = (e) => { if (drag && e.pointerId === drag.id) { drag = null; if (race) race.input.tx = null; } };
cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
const keys = {};
addEventListener('keydown', (e) => {
  keys[e.key] = 1;
  if (!race || mode !== 'race') return;
  if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') { if (race.drill) race.input.tap++; else race.input.dash = true; e.preventDefault(); }
  if (e.key === 'Escape' || e.key === 'p') pause();
  if (race.pending && '123'.includes(e.key)) pick(race.pending[+e.key - 1]);
});
addEventListener('keyup', (e) => { keys[e.key] = 0; });
$('dashBtn').addEventListener('pointerdown', (e) => { e.stopPropagation(); A.unlock(); if (!race) return; if (race.drill) race.input.tap++; else race.input.dash = true; });

function pause() { if (mode !== 'race' || race.pending || race.over) return; race.paused = true; show('pause'); }
$('pauseBtn').onclick = pause;
$('resumeBtn').onclick = () => { race.paused = false; show(null); };
$('quitBtn').onclick = () => { race.paused = false; show(null); race.end('energy'); };

// ------------------------------------------------------------------ mutation cards
function cards() {
  const zi = race.zoneReached;
  $('cardsSub').textContent = `${ZONES[zi - 1].name.toUpperCase()} CLEARED · PLACE #${fmt(race.rank)}`;
  $('cardRow').innerHTML = race.pending.map((id, k) => {
    const m = MUTATIONS[id], have = race.muts[id] || 0;
    return `<button class="card r${m.r}" data-id="${id}"><div class="ic">${m.icon}</div><div><div class="lvl">${['COMMON', 'RARE', 'LEGENDARY'][m.r - 1]}${have ? ' · LV ' + (have + 1) : ''}</div><div class="nm">${m.name}</div><div class="ds">${m.desc}</div></div></button>`;
  }).join('');
  for (const b of $('cardRow').querySelectorAll('.card')) b.onclick = () => pick(b.dataset.id);
  $('rerollBtn').classList.toggle('hide', race.rerolls <= 0);
  $('rerollBtn').textContent = `🎲 Reroll (${race.rerolls})`;
  show('cards');
}
$('rerollBtn').onclick = () => { if (race.reroll()) { A.sfx('tap'); cards(); } };
function pick(id) {
  if (!race.pending || !race.choose(id)) return;
  A.sfx('pick'); show(null);
  const zi = race.zoneReached, z = ZONES[zi];
  banner(z.name, `ZONE ${zi + 1}`, z.coach);
  A.bpm = z.beat; A.sfx('zone');
  R.pop(race.p.x, race.p.y + 60, MUTATIONS[id].icon + ' ' + MUTATIONS[id].name, '#ffd75c', 18, 1.6);
}

// ------------------------------------------------------------------ events -> juice
function onEvents() {
  const p = race.p;
  for (const ev of race.events) {
    if (race.demo) continue;
    switch (ev.type) {
      case 'pass':
        A.sfx('pass', p.combo);
        if (ev.boss) { R.pop(ev.x, ev.y + 30, `PASSED ${ev.boss.toUpperCase()}!`, '#ffd75c', 20, 1.6); R.flash = 0.3; R.flashCol = 'rgba(255,215,92,0.35)'; slow(0.4); R.shake = 6; }
        else passSum += ev.w;
        R.burst(ev.x, ev.y, '#ffffff', 3, 80, 0.35, 2);
        break;
      case 'combo': if (ev.kind === 'close') R.pop(ev.x, ev.y + 30, 'CLOSE!', '#5ce1ff', 15); if (ev.kind === 'gate') R.pop(p.x, p.y + 40, 'THREADED!', '#d9b8ff', 16); break;
      case 'frenzy': A.sfx('frenzy'); R.flash = 0.35; R.flashCol = 'rgba(255,255,255,0.4)'; R.shake = 8; slow(0.35); R.burst(p.x, p.y, '#ffd75c', 30, 260, 0.8, 4); R.pop(p.x, p.y + 80, ev.first ? 'FRENZY!' : 'MEGA FRENZY!', '#ffd75c', 30, 1.4); A.intensity = 2; break;
      case 'frenzyEnd': A.intensity = race.zoneReached >= 3 ? 1 : 0; break;
      case 'comboEnd': if (ev.n >= 10) R.pop(p.x, p.y + 70, `${ev.n} COMBO`, '#ff8bb0', 18); break;
      case 'sugar': A.sfx('sugar'); R.burst(ev.x, ev.y, '#7dffb0', 6, 90, 0.4, 2.5); break;
      case 'dna': A.sfx('dna'); R.burst(ev.x, ev.y, '#ff5cd2', 14, 140, 0.6, 3); R.pop(ev.x, ev.y + 20, '+5 DNA', '#ff8be0', 16); break;
      case 'shield': A.sfx('dna'); R.pop(ev.x, ev.y + 20, '+1 SHIELD', '#ffd75c', 16); break;
      case 'alkali': A.sfx('sugar'); R.pop(ev.x, ev.y + 20, 'pH OK!', '#5cc8ff', 14); break;
      case 'dash': A.sfx('dash'); R.burst(p.x, p.y - 20, '#8cdcff', 10, 180, 0.4, 2.5); R.shake = Math.max(R.shake, 2); break;
      case 'bonk': A.sfx('bonk'); R.shake = 10; R.pop(ev.x, ev.y, 'SPLAT', '#d9b8ff', 20); hint('Find the GAP in the goo wall!', 2); break;
      case 'surf': R.pop(ev.x, ev.y + 20, 'SURF!', '#d9b8ff', 18); break;
      case 'bump': R.shake = 4; R.pop(ev.x, ev.y + 20, 'BONK!', '#ffb36b', 16); A.sfx('bonk'); break;
      case 'pop': A.sfx('pop'); R.burst(ev.x, ev.y, '#f4eef7', 24, 220, 0.7, 4); R.shake = 9; break;
      case 'shieldHit': A.sfx('hit'); R.flash = 0.5; R.flashCol = 'rgba(255,215,92,0.5)'; R.pop(p.x, p.y + 40, 'SHIELD SAVED YOU', '#ffd75c', 17); slow(0.5); break;
      case 'wingHit': A.sfx('hit'); R.pop(p.x, p.y + 40, 'WINGMAN TOOK IT 🫡', '#ffe0a8', 17); break;
      case 'second': A.sfx('frenzy'); R.flash = 0.8; R.flashCol = 'rgba(255,92,140,0.6)'; R.pop(p.x, p.y + 60, 'SECOND WIND!', '#ff5c8a', 26, 1.6); break;
      case 'fork': if (ev.right) hint('You smell something sweet up ahead...', 3); else hint('Hmm. It smells... empty in here.', 3); break;
      case 'drill': A.sfx('zone'); $('drillUI').classList.remove('hide'); banner(ev.rank === 1 ? 'FIRST ONE THERE!' : `#${ev.rank} AT THE EGG`, 'THE EGG', null); slow(0.6); break;
      case 'over': finish(ev); break;
    }
  }
  race.events.length = 0;
}
// overtakes come in floods: show them as one rolling "+places" number instead of a pile of popups
let passSum = 0, passT = 0;
function flushPasses(dt) {
  passT -= dt;
  if (passT <= 0 && passSum >= 2 && race && !race.demo) { R.pop(race.p.x + (Math.random() - 0.5) * 60, race.p.y + 70, '+' + fmt(passSum) + ' places', '#ffffff', 13 + Math.min(9, Math.log10(passSum) * 2.2), 0.8); passSum = 0; passT = 0.45; }
}
function slow(sec) { slowT = Math.max(slowT, sec); }

// ------------------------------------------------------------------ end of run
function finish(o) {
  save();
  setTimeout(() => {
    mode = 'result'; hud(false); A.intensity = 0;
    const win = o.reason === 'win';
    A.sfx(win ? 'win' : 'lose');
    const lines = DEATH_LINES[o.reason] || DEATH_LINES.energy;
    $('resTitle').textContent = win ? "IT'S A BABY! 🍼" : ['SO CLOSE', 'OOF', 'WASTED', 'RIP KEVIN'][Math.floor(Math.random() * 4)];
    $('resWhy').textContent = win ? 'You beat 999,999 swimmers. Nature is amazed.' : lines[Math.floor(Math.random() * lines.length)];
    $('resRank').textContent = '#' + fmt(o.rank);
    $('resStats').innerHTML = `<div class="stat"><b>${(o.dist / PX_PER_CM).toFixed(1)} cm</b>swum</div><div class="stat"><b>${fmt(o.overtakes)}</b>overtakes</div><div class="stat"><b>${o.combo}</b>best combo</div><div class="stat"><b>${o.zone + 1}/7</b>zones</div>`;
    $('resBaby').innerHTML = o.baby ? `<div class="baby"><div class="face">👶</div><div class="bn">${o.baby.name}</div><div class="tr">${o.baby.traits.join(', ')}.</div><div class="tr" style="margin-top:6px;opacity:.7">Generation ${o.baby.gen} begins. The race gets faster.</div></div>` : '';
    $('resMuts').innerHTML = Object.keys(race.muts).map((id) => `<span>${MUTATIONS[id].icon} ${MUTATIONS[id].name}${race.muts[id] > 1 ? ' x' + race.muts[id] : ''}</span>`).join('');
    $('resDna').textContent = `+${fmt(o.dna)} DNA 🧬`;
    show('result');
  }, o.reason === 'win' ? 1400 : 900);
  if (o.reason === 'win') { R.flash = 1; R.flashCol = 'rgba(255,240,200,0.9)'; for (let i = 0; i < 6; i++) R.burst(race.p.x, race.p.y + 150, ['#ffd75c', '#ff5c8a', '#5ce1ff'][i % 3], 30, 400, 1.4, 5); }
  else { R.shake = 14; R.flash = 0.5; R.flashCol = 'rgba(120,0,30,0.6)'; }
}
$('againBtn').onclick = () => start();
$('resMenuBtn').onclick = () => title();

// ------------------------------------------------------------------ shop + album
let shopFrom = 'title';
function shop(from) {
  shopFrom = from || shopFrom; show('shop');
  $('dnaTop').textContent = `${fmt(meta.dna)} DNA 🧬`;
  $('shopList').innerHTML = HABIT_ORDER.map((id) => {
    const h = HABITS[id], l = lv(meta, id), maxed = l >= h.max, cost = habitCost(id, l);
    return `<div class="hab"><div class="ic">${h.icon}</div><div><div class="nm">${h.name}</div><div class="ds">${h.desc}</div><div class="pips">${'●'.repeat(l)}${'○'.repeat(h.max - l)}</div></div><button data-id="${id}" ${maxed || meta.dna < cost ? 'disabled' : ''}>${maxed ? 'MAX' : fmt(cost)}<small>${maxed ? '' : 'DNA'}</small></button></div>`;
  }).join('');
  for (const b of $('shopList').querySelectorAll('button')) b.onclick = () => { if (buyHabit(meta, b.dataset.id)) { A.unlock(); A.sfx('buy'); save(); shop(); } };
}
$('shopBtn').onclick = () => { A.unlock(); shop('title'); };
$('resShopBtn').onclick = () => shop('result');
$('shopBack').onclick = () => (shopFrom === 'result' ? show('result') : title());
$('albumBtn').onclick = () => {
  show('album');
  $('albumList').innerHTML = meta.babies.length ? meta.babies.slice().reverse().map((b) => `<div class="baby"><div class="face">👶</div><div class="bn">${b.name}</div><div class="tr">${b.traits.join(', ')}.</div><div class="tr" style="opacity:.6">Generation ${b.gen} · swim #${b.run}</div></div>`).join('')
    : '<div class="sub">No babies yet. Win a race to make one.<br><br>The current record holder is Chad Thundertail, who has never won.</div>';
};
$('albumBack').onclick = () => title();
$('playBtn').onclick = () => { A.unlock(); if (!meta.introSeen) intro(start); else start(); };
$('muteChk').onchange = (e) => { meta.muted = e.target.checked; A.setMuted(meta.muted); save(); };
$('autoChk').onchange = (e) => { meta.autopilot = e.target.checked; save(); };

// ------------------------------------------------------------------ HUD
const ticks = ZSTART.slice(1).map((y) => `<div class="tick" style="left:${y / RACE_LEN * 100}%"></div>`).join('');
$('prog').insertAdjacentHTML('afterbegin', ticks + RIVALS.map((r, k) => `<div class="rv" id="rv${k}" style="background:${r.col}"></div>`).join(''));
let lastZone = 0;
function drawHud(dt) {
  const p = race.p;
  // rank rolls toward the real number (in log space so the big drops feel big)
  const lr = Math.log(shownRank), tr = Math.log(race.rank);
  shownRank = Math.exp(lr + (tr - lr) * Math.min(1, dt * 6));
  if (Math.abs(shownRank - race.rank) < 0.6) shownRank = race.rank;
  const rEl = $('rank'), txt = '#' + fmt(shownRank);
  if (rEl.textContent !== txt) { rEl.textContent = txt; rEl.classList.add('bump'); clearTimeout(rEl._t); rEl._t = setTimeout(() => rEl.classList.remove('bump'), 80); }
  rEl.style.color = race.rank <= 1 ? '#ffd75c' : race.rank <= 10 ? '#7dffb0' : '#fff';
  $('alive').textContent = fmt(race.alive) + ' swimmers alive';
  $('cm').textContent = (race.remaining() / PX_PER_CM).toFixed(1) + ' cm';
  const zi = zoneIndex(p.y); if (zi !== lastZone) { lastZone = zi; $('zoneName').textContent = ZONES[zi].name; }
  $('progFill').style.width = (race.progress() * 100).toFixed(2) + '%';
  $('me').style.left = (race.progress() * 100).toFixed(2) + '%';
  race.agents.slice(0, RIVALS.length).forEach((a, k) => { const el = $('rv' + k); el.style.left = Math.min(100, a.y / RACE_LEN * 100) + '%'; el.style.opacity = a.alive ? 1 : 0.2; });
  const ef = $('efill'); ef.style.width = Math.max(0, p.e / p.maxE * 100) + '%'; ef.classList.toggle('low', p.e < 25);
  $('shields').textContent = '⛑️'.repeat(p.shield) + (p.wing ? '🤝' : '');
  const cb = $('combo');
  if (p.combo >= 3) {
    cb.style.opacity = 1; cb.querySelector('.n').textContent = p.combo + 'x';
    let w = ''; for (const [n, word] of COMBO_WORDS) if (p.combo >= n) w = word; cb.querySelector('.w').textContent = w;
    cb.querySelector('.bar i').style.width = Math.max(0, p.comboT / race.s.combo * 100) + '%';
    cb.classList.toggle('fz', p.frenzyT > 0);
    cb.querySelector('.n').style.fontSize = Math.min(72, 44 + p.combo * 0.4) + 'px';
  } else cb.style.opacity = 0;
  $('dashBtn').classList.toggle('cd', p.dashCd > 0 && !race.drill);
  $('dashBtn').textContent = race.drill ? 'DRILL' : 'DASH';
  if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) $('banner').classList.remove('on'); }
  if (hintT > 0) { hintT -= dt; if (hintT <= 0) $('hint').style.opacity = 0; }
}

// ------------------------------------------------------------------ main loop
let last = performance.now();
function frame(now) {
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (slowT > 0) { slowT -= dt; timeScale = 0.35; } else timeScale += (1 - timeScale) * Math.min(1, dt * 6);
  if (race) {
    const kd = (keys.ArrowLeft || keys.a ? -1 : 0) + (keys.ArrowRight || keys.d ? 1 : 0);
    if (!drag && mode === 'race') race.input.dir = kd;
    const sdt = dt * timeScale;
    const n = 4; for (let i = 0; i < n; i++) race.step(sdt / n);
    if (race.demo && (race.over || race.pending)) { if (race.pending) race.choose(race.pending[0]); else demo(); }
    onEvents(); flushPasses(dt);
    if (mode === 'race' && race.pending && $('cards').classList.contains('hide')) { A.sfx('zone'); cards(); }
    R.draw(race, dt);
    if (mode === 'race' && !race.over) drawHud(dt);
  }
  A.tick();
  requestAnimationFrame(frame);
}
addEventListener('resize', () => R.resize());
document.addEventListener('visibilitychange', () => { if (document.hidden) { save(); if (mode === 'race' && race && !race.over) pause(); } });
R.resize();
title();
requestAnimationFrame(frame);

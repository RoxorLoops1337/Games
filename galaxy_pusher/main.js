// Galaxy Pusher: game loop, input, presentation (animations, effects) and saves.
import { loadPhysics, Machine, EDGE, SHOOTER, LAYER_H } from './machine.js';
import { View3D } from './view3d.js';
import { Game, ITEMS, ITEM_ORDER, W, WHEEL, TOWER, ROW, isToken, KIND, REGEN_BELOW, REGEN_EVERY, foeAt, SECTORS, COMBO_FULL, comboMult, FEVER_TIME, AUTO_SHOTS } from './core.js';
import { buildSprites, drawBattle, drawWheel, pocketAngle, sprite, txt, rr, COLS, FONT } from './render.js';
import { A, S, Music } from './audio.js';

const SAVE_KEY = 'galaxy_pusher_v1';
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const backOut = (t) => { t = clamp(t, 0, 1); const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

const cv = document.getElementById('cv');
const g = cv.getContext('2d');
let dpr = 1, VW = 0, VH = 0, L = null, view = null;
const cv3 = document.getElementById('cv3');
// world -> screen for the 2D effects drawn over the 3D machine
const cam = { P: (x, y, z) => view.project(x, y, z, L.mach) };

// ------------------------------------------------------------------------------------------------ state
let game = null;
function loadGame() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { s = null; }
  let gm = null;
  try { gm = s ? Game.load(s, new Machine(), (Date.now() & 0xffffff) || 1) : null; } catch (e) { console.error(e); gm = null; }
  if (gm) {
    const away = Math.max(0, (Date.now() - (s.at || Date.now())) / 1000);
    if (gm.bank < REGEN_BELOW) { const add = Math.min(REGEN_BELOW - gm.bank, Math.floor(away / REGEN_EVERY)); if (add > 0) { gm.bank += add; welcomeBack = add; } }
    return gm;
  }
  const ng = new Game((Date.now() & 0xffffff) || 1, new Machine());
  ng.newMachine();
  return ng;
}
let welcomeBack = 0;
function save() {
  if (!game) return;
  try { const s = game.save(); s.at = Date.now(); s.seen = seen; localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch (e) { /* storage full or blocked */ }
}
let seen = false;
try { seen = !!(JSON.parse(localStorage.getItem(SAVE_KEY) || 'null') || {}).seen; } catch (e) { seen = false; }

// presentation state
const B = {
  heroes: [{ id: 'rox', col: 'B', x: 0.1, dx: 0, dy: 0, pose: 'idle', glow: 0, act: null }, { id: 'jas', col: 'P', x: 0.245, dx: 0, dy: 0, pose: 'idle', glow: 0, act: null }, { id: 'mew', col: 'Y', x: 0.395, dx: 0, dy: 0, pose: 'idle', glow: 0, act: null }],
  foe: null, row: [], rowPop: [], slots: [], shake: 0, stage: '',
};
const fx = { parts: [], floats: [], flyers: [], shots: [], banners: [], lasers: [], rings: [], bankFly: [] };
let actions = [];          // queued hero attacks (played one after another)
let killPending = false, killWait = 0, dying = null;
let wheel = null;
let shake = 0, flash = 0, edgeGlow = 0, combo = 0, comboT = 0, payAcc = 0, payAccT = 0, payAccX = W / 2;
let firing = null, fireL = false, fireR = false, auto = false, autoSide = 'L', paused = true, started = false;
let bankShown = 0, bankPop = 0, scoreShown = 0, scorePop = 0, comboPop = 0, t = 0;
const shooter = { L: { flash: 0, glow: 0, left: 0, col: null }, R: { flash: 0, glow: 0, left: 0, col: null } };
let tip = null, tipsSeen = {};
try { tipsSeen = JSON.parse(localStorage.getItem('galaxy_pusher_tips') || '{}') || {}; } catch (e) { tipsSeen = {}; }
function showTip(id, text) { if (tipsSeen[id]) return; tipsSeen[id] = 1; try { localStorage.setItem('galaxy_pusher_tips', JSON.stringify(tipsSeen)); } catch (e) { /* */ } tip = { text, t: 0 }; }

function mkFoeView(foe, enter) {
  return { kind: foe.kind, name: foe.name, boss: foe.boss, max: foe.max, shown: foe.hp, lag: foe.hp, dx: enter ? 200 : 0, dy: 0, flash: 0, alpha: enter ? 0 : 1, scale: 1, enter: enter ? 0 : 1 };
}
function stageLabel() { const i = game.foeIdx; return `SECTOR ${Math.floor(i / 5) + 1}-${(i % 5) + 1} · ${SECTORS[Math.floor(i / 5) % SECTORS.length].name.toUpperCase()}`; }
function syncView() {
  B.row = game.row.slice(); B.rowPop = [];
  B.foe = game.foe ? mkFoeView(game.foe, false) : null;
  B.stage = stageLabel();
  bankShown = game.bank; scoreShown = game.score;
}

// ------------------------------------------------------------------------------------------------ layout
function layout() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  VW = window.innerWidth; VH = window.innerHeight;
  cv.width = Math.round(VW * dpr); cv.height = Math.round(VH * dpr);
  cv.style.width = VW + 'px'; cv.style.height = VH + 'px';
  const probe = document.getElementById('safe'); const cs = getComputedStyle(probe);
  const st = parseFloat(cs.paddingTop) || 0, sb = parseFloat(cs.paddingBottom) || 0;
  const gw = Math.min(VW, Math.max(320, VH * 0.6), 560), gx = (VW - gw) / 2;
  const hud = { x: gx, y: st, w: gw, h: 42 };
  const barH = 66;
  const bar = { x: gx, y: VH - sb - barH, w: gw, h: barH };
  // a slim battle strip; the machine gets everything else
  const bh = clamp(VH * 0.19, 126, 168);
  const battle = { x: gx + 6, y: hud.y + hud.h, w: gw - 12, h: bh };
  const mach = { x: gx, y: battle.y + battle.h + 2, w: gw, h: bar.y - (battle.y + battle.h + 2) };
  L = { gw, gx, hud, battle, bar, mach, st, sb };
  Object.assign(cv3.style, { left: mach.x + 'px', top: mach.y + 'px', width: mach.w + 'px', height: mach.h + 'px' });
  if (view) view.resize(mach.w, mach.h);
  const bs = Math.min(60, barH - 8), fw = Math.min(gw * 0.3, bs * 2.1), sw = (gw - fw * 2 - 40) / 2;
  const put = (id, x, w, h) => Object.assign(document.getElementById(id).style, { left: x + 'px', top: (bar.y + (barH - h) / 2) + 'px', width: w + 'px', height: h + 'px' });
  put('fireL', gx + 10, fw, bs); put('fireR', gx + gw - 10 - fw, fw, bs);
  put('autoBtn', gx + 20 + fw, sw, bs * 0.8); put('itemBtn', gx + 20 + fw + sw, sw, bs * 0.8);
  const mb = document.getElementById('menuBtn');
  Object.assign(mb.style, { left: (gx + gw - 46) + 'px', top: (st + 5) + 'px' });
}
window.addEventListener('resize', layout);

// ------------------------------------------------------------------------------------------------ input
function inMachine(x, y) { return L && y > L.mach.y && y < L.bar.y + L.bar.h && x > L.gx - 40 && x < L.gx + L.gw + 40; }
let aimPtr = null;
cv.addEventListener('pointerdown', (e) => {
  if (!started || paused) return;
  A.unlock();
  if (wheel && wheel.phase === 'show' && wheel.t > 0.6) { wheel.t = Math.max(wheel.t, wheel.showEnd - 0.2); return; }
  // hold on the left half for the left shooter, the right half for the right one
  if (inMachine(e.clientX, e.clientY)) { aimPtr = e.pointerId; firing = e.clientX < L.gx + L.gw / 2 ? 'L' : 'R'; try { cv.setPointerCapture(e.pointerId); } catch (er) { /* */ } }
});
cv.addEventListener('pointermove', (e) => { if (aimPtr === e.pointerId) firing = e.clientX < L.gx + L.gw / 2 ? 'L' : 'R'; });
const endPtr = (e) => { if (aimPtr === e.pointerId) { aimPtr = null; firing = null; } };
cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', endPtr);
for (const side of ['L', 'R']) {
  const el = document.getElementById('fire' + side);
  const set = (on) => { if (side === 'L') fireL = on; else fireR = on; el.classList.toggle('on', on); };
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); A.unlock(); set(true); });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, () => set(false));
}
const autoEl = document.getElementById('autoBtn');
autoEl.addEventListener('click', () => { auto = !auto; autoEl.classList.toggle('on', auto); S.click(); });
const keys = {};
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Space') { e.preventDefault(); A.unlock(); }
  if (e.code === 'Escape') toggleMenu();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

// ------------------------------------------------------------------------------------------------ effects helpers
function burstParts(x, y, n, col, sp = 160, life = 0.7, size = 3, grav = 300) {
  for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = sp * (0.3 + Math.random() * 0.7); fx.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - sp * 0.3, life, max: life, col: Array.isArray(col) ? col[i % col.length] : col, size: size * (0.6 + Math.random() * 0.8), grav }); }
}
function floatText(text, x, y, col, size = 16, life = 0.9, vy = -50) { fx.floats.push({ text, x, y, col, size, life, max: life, vy }); }
function banner(text, col, sub, dur = 1.5, big = 1) { fx.banners = fx.banners.filter((b) => b.t < b.dur - 0.3); fx.banners.push({ text, col, sub, t: 0, dur, big }); }
function addShake(v) { shake = Math.max(shake, v); }
const buzz = (ms) => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* */ } };
function edgePoint(fx_) { const p = cam.P(clamp(fx_, -W / 2 + 0.5, W / 2 - 0.5), 0, EDGE); return [p.x, p.y]; }
function heroPos(col) {
  const H = B.heroes.find((h) => h.col === col), R = L.battle;
  return [R.x + R.w * H.x + H.dx, R.y + R.h * 0.82 - R.h * 0.3];
}
function foePos() { const R = L.battle, E = B.foe; return [R.x + R.w * 0.79 + (E ? E.dx : 0), R.y + R.h * 0.58 + (E ? E.dy : 0)]; }

const SHOUT = { B: ['BOOM!', 'TSS!', 'KA!', 'PF!', 'BRRT!'], P: ['LA~', 'OOH!', 'HAA!', 'MI!'], Y: ['NYA!', 'MEOW!', 'POW!'] };
function releaseDamage(n, col) {
  const E = B.foe; if (!E) return;
  E.shown = Math.max(0, E.shown - n);
  E.flash = 1; E.dx += 10; E.kick = 1;
  const [x, y] = foePos();
  floatText(String(Math.round(n)), x + (Math.random() - 0.5) * 30, y - 20 - Math.random() * 20, col ? COLS[col].light : '#fff', n >= 30 ? 30 : 22, 0.9, -70);
  if (col) { const W_ = SHOUT[col]; floatText(W_[Math.floor(Math.random() * W_.length)], x + 30 + Math.random() * 20, y - 50 - Math.random() * 20, COLS[col].main, 15, 0.6, -40); }
  burstParts(x, y, n >= 30 ? 16 : 6, col ? [COLS[col].main, '#fff'] : ['#5cd0ff', '#fff'], 200, 0.5, 3, 200);
}

// ------------------------------------------------------------------------------------------------ hero attacks
function queueAttack(col, dmg, lv, team) { actions.push({ col, dmg, team, t: 0, hits: 0 }); }
function stepActions(dt) {
  if (!actions.length) return;
  // a team strike plays all three at once; single attacks play one at a time
  const a = actions[0];
  a.t += dt;
  const H = B.heroes.find((h) => h.col === a.col);
  const R = L.battle;
  const nh = a.team ? 1 : 3;
  const dur = a.team ? 0.9 : 1.15;
  if (a.col === 'Y') { // Mew dashes in and punches
    const reach = R.w * (0.79 - H.x) - R.w * 0.14;
    H.dx = a.t < 0.25 ? reach * ease(a.t / 0.25) : a.t < dur - 0.25 ? reach + Math.sin(a.t * 40) * 4 : reach * (1 - ease((a.t - (dur - 0.25)) / 0.25));
    H.pose = a.t < dur - 0.2 ? 'attack' : 'idle';
    for (let i = a.hits; i < nh; i++) if (a.t > 0.3 + i * 0.18) { a.hits++; S.hit('Y', i === nh - 1); releaseDamage(a.dmg / nh, 'Y'); addShake(i === nh - 1 ? 7 : 4); const [x, y] = foePos(); fx.rings.push({ x: x - 30, y, r: 6, life: 0.3, max: 0.3, col: '#ffd75c' }); }
  } else { // Rox beatboxes sound waves, Jas sings notes
    H.pose = a.t < dur - 0.15 ? (a.col === 'B' ? 'attack' : 'sing') : 'idle';
    H.dx = a.t < 0.1 ? 8 * (a.t / 0.1) : 8 * Math.max(0, 1 - (a.t - 0.1) * 3);
    for (let i = a.hits; i < nh; i++) if (a.t > 0.12 + i * 0.2) {
      a.hits++;
      const [hx, hy] = heroPos(a.col), [ex, ey] = foePos();
      fx.shots.push({ x0: hx + 20, y0: hy, x1: ex, y1: ey, t: 0, dur: 0.32, col: a.col, kind: a.col === 'B' ? 'wave' : 'note', dmg: a.dmg / nh, last: i === nh - 1 });
      S.hit(a.col === 'B' ? 'B' : 'P', false);
    }
  }
  H.glow = Math.max(H.glow, 0.6);
  if (a.t >= dur && (a.col === 'Y' || a.hits >= nh)) {
    H.pose = 'idle'; H.dx = 0;
    actions.shift();
    // team strike: start the others right away
    if (a.team && actions.length && actions[0].team) actions[0].t = Math.max(actions[0].t, 0);
  }
}

// ------------------------------------------------------------------------------------------------ the wheel
function openWheel() {
  const pocket = game.spinWheel();
  if (pocket < 0) return;
  const spinT = 4.6 + Math.random() * 0.8, w0 = 2.4 + Math.random() * 0.6, b0 = -(9 + Math.random() * 2);
  const kw = 0.35, kb = 0.75;
  const rotAt = (tt) => (w0 * (1 - Math.exp(-kw * tt))) / kw;
  const ballRaw = (tt) => (b0 * (1 - Math.exp(-kb * tt))) / kb;
  // aim the ball: where must it be relative to the wheel at landing time?
  const want = pocketAngle(pocket) + rotAt(spinT);
  const raw = ballRaw(spinT) - Math.PI / 2;
  let corr = want - raw; corr = ((corr % TAU) + TAU) % TAU; if (corr > Math.PI) corr -= TAU;
  wheel = { phase: 'in', t: 0, pocket, spinT, rotAt, ballRaw, corr, lastSeg: 0, showEnd: 2.4, hops: 0 };
  S.wheelOpen();
  banner('GALAXY WHEEL', '#ffd75c', 'where will the ball land?', 1.4, 0.9);
}
function stepWheel(dt) {
  const Wh = wheel; if (!Wh) return;
  Wh.t += dt;
  if (Wh.phase === 'in' && Wh.t > 0.6) { Wh.phase = 'spin'; Wh.t = 0; }
  else if (Wh.phase === 'spin') {
    const tt = Math.min(Wh.t, Wh.spinT);
    const rot = Wh.rotAt(tt);
    const k = clamp(tt / Wh.spinT, 0, 1), sm = k * k * (3 - 2 * k);
    const ba = Wh.ballRaw(tt) - Math.PI / 2 + Wh.corr * sm;
    // radius: on the outer track, then drops into the pocket ring in the last 0.8 s, with hops
    const drop = clamp((tt - (Wh.spinT - 0.8)) / 0.8, 0, 1);
    Wh.ball = { a: ba, r: lerp(0.92, 0.7, ease(drop)), hop: drop > 0 && drop < 1 ? Math.abs(Math.sin(drop * Math.PI * 3)) * 0.06 * (1 - drop) : 0 };
    Wh.rot = rot;
    const rel = (((ba - rot + Math.PI / 2) % TAU) + TAU) % TAU, seg = Math.floor(rel / (TAU / WHEEL.length));
    if (seg !== Wh.lastSeg) { Wh.lastSeg = seg; S.tick(1 - k); }
    if (drop > 0 && Wh.hops < Math.floor(drop * 3)) { Wh.hops++; S.ballHop(); }
    if (Wh.t >= Wh.spinT) {
      Wh.phase = 'show'; Wh.t = 0; S.ballDrop();
      const P = WHEEL[Wh.pocket];
      S.prize(P.c === 'JP'); buzz([30, 40, 60]);
      const C = COLS[P.c];
      banner(P.c === 'JP' ? 'JACKPOT TOWER!' : `${C.name} TOWER`, C.main, `${TOWER[P.c]} ${P.c === 'JP' || P.c === 'V' ? 'GOLD ' : ''}COINS${P.lv ? ' · ALL HEROES LEVEL UP' : ''}`, 2.2, 1.1);
      addShake(6);
      Wh.showEnd = 2.0;
    }
  } else if (Wh.phase === 'show') {
    Wh.rot = Wh.rotAt(Wh.spinT) + Wh.t * 0.3;
    Wh.ball = { a: pocketAngle(Wh.pocket) + Wh.rot, r: 0.7, hop: 0 };
    if (Wh.t >= Wh.showEnd) { Wh.phase = 'out'; Wh.t = 0; game.resolveWheel(Wh.pocket); }
  } else if (Wh.phase === 'out' && Wh.t > 0.45) {
    wheel = null;
    if (game.wheelQ > 0) openWheel(); else { game.nextFoe(); }
  }
}

// ------------------------------------------------------------------------------------------------ core events -> presentation
function handle(e) {
  switch (e.t) {
    case 'fire': S.fire(); shooter[e.side].flash = 1; break;
    case 'autoShot': S.fire(); shooter[e.side].flash = 1; shooter[e.side].left = e.left; if (e.left <= 0) shooter[e.side].col = null; break;
    case 'autoStart': { const S2 = shooter[e.side]; S2.glow = 1; S2.col = e.col; S2.left = e.n; const p = cam.P(SHOOTER[e.side].x, SHOOTER[e.side].y, SHOOTER[e.side].z); floatText(`+${e.n} FREE`, p.x + (e.side === 'L' ? 40 : -40), p.y + 30, COLS[e.col].light, 18, 1.2, -30); break; }
    case 'combo': comboPop = 1; if (e.combo >= 2) floatText(`COMBO ${e.combo}  x${e.mult.toFixed(2).replace(/0$/, '')}`, L.gx + L.gw / 2, L.mach.y + L.mach.h * 0.12, '#ffd75c', 16, 1.2, -20); break;
    case 'comboBreak': if (e.combo > 0) { banner('COMBO BREAK', '#ff6b74', `6 slots, no three of a kind · combo ${e.combo} lost`, 1.5, 0.9); S.lost(); addShake(4); } else banner('ROW FULL', '#ff6b74', 'no three of a kind', 1.0, 0.7); buzz(60); break;
    case 'reward': floatText(`+${e.coins} coins`, L.hud.x + 60, L.hud.y + 40, '#ffd75c', 15, 1.4, -15); bankPop = 1; break;
    case 'land': if (e.v > 7) S.land(e.v / 10); break;
    case 'clink': S.clink(e.v / 8); break;
    case 'pay': {
      combo = comboT > 0 ? combo + 1 : 0; comboT = 0.7;
      S.pay(Math.min(10, combo), e.k === 'g');
      const [x, y] = edgePoint(e.x);
      burstParts(x, y + 4, e.k === 'g' ? 6 : 3, e.k === 'g' ? ['#ffd75c', '#fff'] : ['#dfe6f2', '#ffd75c'], 120, 0.5, 2.5, 400);
      payAcc += e.v; payAccT = 0.35; payAccX = e.x;
      if (fx.bankFly.length < 14) fx.bankFly.push({ x0: x, y0: y, t: 0, dur: 0.55 + Math.random() * 0.2, gold: e.k === 'g' });
      edgeGlow = Math.min(1, edgeGlow + 0.15);
      if (B.foe) { const [fx_, fy] = foePos(); fx.lasers.push({ x0: L.battle.x + L.battle.w * 0.5, y0: L.battle.y + L.battle.h * 0.18, x1: fx_, y1: fy, life: 0.18, max: 0.18 }); S.laser(); }
      if (e.v) releaseChip(e.v > 1 ? 2 : 1);
      break;
    }
    case 'payToken': {
      S.token(e.k); buzz(15);
      const [x, y] = edgePoint(e.x);
      burstParts(x, y, 14, [COLS[e.k].main, COLS[e.k].light, '#fff'], 220, 0.7, 3.5, 300);
      fx.flyers.push({ k: e.k, x0: x, y0: y, t: 0, dur: 0.6 });
      edgeGlow = 1;
      break;
    }
    case 'lost': { const [x, y] = edgePoint(e.x); S.lost(); floatText('×', x, y, '#ff6b74', 14, 0.5, -20); break; }
    case 'portOut': S.port(e.k); if (view) view.portFlash(e.k); break;
    case 'attack': queueAttack(e.col, e.dmg, e.lv, false); break;
    case 'team': banner('TEAM STRIKE!', '#fff', 'row full: everyone attacks', 1.3); S.team(); break;
    case 'hit': if (e.src === 'team') { actions.push({ col: e.col, dmg: e.n, team: true, t: 0, hits: 0 }); } else if (e.src === 'carry') releaseDamage(e.n, null); break;
    case 'levelUp': {
      const H = B.heroes.find((h) => h.col === e.col); H.glow = 1.5;
      const [x, y] = heroPos(e.col); floatText('LEVEL UP!', x, y - 40, COLS[e.col].light, 15, 1.4, -30); S.levelUp();
      burstParts(x, y, 16, [COLS[e.col].main, '#fff', '#ffd75c'], 160, 0.9, 3, -60);
      break;
    }
    case 'kill': killPending = true; killWait = 0; break;
    case 'foe': B.foe = mkFoeView(e.foe, true); B.stage = stageLabel(); if (e.foe.boss) banner('BOSS!', '#ff3b47', e.foe.name, 1.6, 1.1); else banner(e.foe.name.toUpperCase(), '#5cd0ff', 'incoming', 1.0, 0.7); break;
    case 'fever': banner('DOUBLE TIME!', '#fff', 'combo meter full · double damage and points', 1.8, 1.2); S.fever(); Music.fever(true); addShake(5); buzz([20, 30, 20]); break;
    case 'feverEnd': Music.fever(false); break;
    case 'bonus': break;
    case 'towerStart': break;
    case 'towerCoin': S.towerCoin(e.i, e.n); if (e.i % 4 === 0) { const p = cam.P(e.T.x, e.i * LAYER_H, e.T.z); burstParts(p.x, p.y, 1, '#fff', 60, 0.3, 2, 0); } break;
    case 'towerDone': { S.towerDone(); const p = cam.P(e.T.x, e.T.hgt, e.T.z); burstParts(p.x, p.y, 20, ['#ffd75c', '#fff', COLS[e.T.col].main], 200, 0.8, 3, 200); floatText('STAR TOWER x' + e.T.n, p.x, p.y - 20, '#ffd75c', 16, 1.4, -25); break; }
    case 'topple': S.creak(); S.creak(); { const p = cam.P(e.T.x, e.T.hgt, e.T.z); floatText('!!', p.x, p.y - 16, '#ff6b74', 22, 0.8, -20); } break;
    case 'fall': S.topple(); addShake(4); break;
    case 'smack': { view.smack(e.x, e.y); S.smack(e.n); addShake(22); flash = 0.3; buzz([60, 40, 120]); const p = cam.P(e.x, e.y, e.z); floatText('SMACK!', p.x, p.y, '#ffffff', 34, 1.0, -30); break; }
    case 'burst': S.burst(e.n); addShake(14); flash = 0.35; buzz([40, 30, 80]); banner('TOWER DOWN!', '#ffd75c', `${e.n} coins spill`, 1.2, 1); break;
    case 'regen': S.regen(); break;
    case 'sector': setTimeout(() => { banner(`SECTOR ${e.n} CLEAR!`, '#2bd67b', `+${e.prize} coins to shoot`, 2.0, 1.1); S.prize(true); bankPop = 1; }, 1400); break;
    case 'item': {
      const I = ITEMS[e.id]; banner(I.name.toUpperCase() + '!', ICON[e.id][1], e.id === 'guard' ? 'gutters closed' : e.id === 'turbo' ? 'pusher at double speed' : e.id === 'wheel' ? 'bonus spin' : e.id === 'rain' ? 'tokens incoming' : 'everything jolts forward', 1.2, 0.9);
      S.fever(); break;
    }
    case 'quake': addShake(16); S.burst(10); buzz([60, 40, 60]); break;
    case 'itemEnd': floatText(ITEMS[e.id].name + ' over', L.gx + L.gw / 2, L.mach.y + 40, '#bfe6ff', 13, 1.2, -10); break;
    default: break;
  }
}
function releaseChip(n) { const E = B.foe; if (!E) return; E.shown = Math.max(0, E.shown - n); E.flash = Math.max(E.flash, 0.35); }

// ------------------------------------------------------------------------------------------------ update
let saveT = 0, last = 0;
function update(dt) {
  t += dt;
  // firing: the side you hold; AUTO and both sides held take turns
  let side = null;
  const wantL = fireL || firing === 'L' || keys.ArrowLeft, wantR = fireR || firing === 'R' || keys.ArrowRight;
  if (wantL && wantR) side = autoSide; else if (wantL) side = 'L'; else if (wantR) side = 'R'; else if (auto || keys.Space) side = autoSide;
  if (side && !paused && game.canFire() && game.fire(side)) { buzz(6); autoSide = autoSide === 'L' ? 'R' : 'L'; }
  for (const k of ['L', 'R']) { shooter[k].flash = Math.max(0, shooter[k].flash - dt * 8); shooter[k].glow = Math.max(game.autoQ.some((A) => A.side === k) ? 1 : 0, shooter[k].glow - dt * 2); }
  if (!paused) game.tick(dt);
  for (const e of game.out) handle(e);
  game.out.length = 0;

  // tokens flying up into the row
  for (const f of fx.flyers) f.t += dt;
  const landed = fx.flyers.filter((f) => f.t >= f.dur);
  fx.flyers = fx.flyers.filter((f) => f.t < f.dur);
  for (const f of landed) {
    B.row.push(f.k); const i = B.row.length - 1; B.rowPop[i] = 1; S.slot(i);
    showTip('row', 'Get 3 of a colour and that hero attacks!');
    const same = B.row.filter((q) => q === f.k).length;
    if (same >= 3) {
      // three of a kind: they fly to the hero
      let left = 3; const idx = [];
      B.row.forEach((q, j) => { if (q === f.k && left-- > 0) idx.push(j); });
      for (const j of idx) { const s = B.slots[j]; if (s) { const [hx, hy] = heroPos(f.k); fx.flyers2 = fx.flyers2 || []; fx.flyers2.push({ k: f.k, x0: s[0], y0: s[1], x1: hx, y1: hy, t: 0, dur: 0.35 }); } }
      left = 3; B.row = B.row.filter((q) => !(q === f.k && left-- > 0)); B.rowPop = [];
      S.triple(f.k); buzz([20, 20, 40]);
      banner(`${COLS[f.k].name} x3!`, COLS[f.k].main, `${f.k === 'B' ? 'Rox' : f.k === 'P' ? 'Jas' : 'Mew'} attacks!`, 1.0, 0.8);
    } else if (B.row.length >= ROW) { B.row = []; B.rowPop = []; }
  }
  if (fx.flyers2) { for (const f of fx.flyers2) f.t += dt; fx.flyers2 = fx.flyers2.filter((f) => f.t < f.dur); }
  if (!fx.flyers.length && !actions.length && JSON.stringify(B.row) !== JSON.stringify(game.row)) { B.row = game.row.slice(); }
  for (let i = 0; i < ROW; i++) if (B.rowPop[i]) B.rowPop[i] = Math.max(0, B.rowPop[i] - dt * 4);

  // hero attacks only start once the matching tokens have arrived
  if (!fx.flyers.length || actions.length && actions[0].t > 0) stepActions(dt);
  for (const s of fx.shots) {
    s.t += dt;
    if (s.t >= s.dur && !s.done) { s.done = true; releaseDamage(s.dmg, s.col); if (s.last) addShake(6); S.hit(s.col, s.last); fx.rings.push({ x: s.x1, y: s.y1, r: 8, life: 0.35, max: 0.35, col: COLS[s.col].light }); }
  }
  fx.shots = fx.shots.filter((s) => !s.done);

  // enemy view
  const E = B.foe;
  if (E) {
    E.enter = Math.min(1, E.enter + dt * 2); if (!dying) { E.alpha = E.enter; E.dx = lerp(E.dx, 0, Math.min(1, dt * 8)); }
    E.dy = Math.sin(t * 2) * 3;
    E.flash = Math.max(0, E.flash - dt * 5);
    E.lag = E.lag > E.shown ? Math.max(E.shown, E.lag - (E.max * 0.6 + 20) * dt) : E.shown;
    if (game.foe && !killPending && E.shown < game.foe.hp) E.shown = game.foe.hp;            // never show less than the truth
    if (game.foe && !killPending && E.shown > game.foe.hp && !actions.length && !fx.shots.length) E.shown = Math.max(game.foe.hp, E.shown - (E.shown - game.foe.hp) * dt * 6);
  }
  if (killPending) {
    killWait += dt;
    if (!actions.length && !fx.shots.length && (killWait > 0.6 || (E && E.shown <= 0))) {
      killPending = false;
      if (E) { E.shown = 0; dying = { t: 0 }; S.kill(); buzz([30, 50, 90]); addShake(12); }
      else dying = { t: 1.2 };
    }
  }
  if (dying) {
    dying.t += dt;
    if (E) { E.flash = dying.t < 0.6 ? (Math.sin(dying.t * 40) > 0 ? 1 : 0) : 0; E.dx = (Math.random() - 0.5) * 8 * (1 - dying.t); E.alpha = dying.t < 0.6 ? 1 : Math.max(0, 1 - (dying.t - 0.6) * 4); E.scale = dying.t < 0.6 ? 1 : 1 + (dying.t - 0.6) * 1.5; }
    if (E && dying.t > 0.6 && !dying.boom) { dying.boom = true; const [x, y] = foePos(); burstParts(x, y, 50, ['#ffd75c', '#ff4fb0', '#5cd0ff', '#fff'], 340, 1.0, 4, 120); fx.rings.push({ x, y, r: 10, life: 0.6, max: 0.6, col: '#fff' }); flash = 0.4; banner('DEFEATED!', '#ffd75c', 'spin the Galaxy Wheel', 1.2, 1); }
    if (dying.t > 1.3) { dying = null; B.foe = null; if (game.wheelQ > 0 && !wheel) openWheel(); else game.nextFoe(); }
  }
  if (!wheel && !dying && !killPending && game.wheelQ > 0 && !actions.length) openWheel();
  stepWheel(dt);

  // misc decay
  for (const H of B.heroes) H.glow = Math.max(0, H.glow - dt);
  shake = Math.max(0, shake - dt * 30); flash = Math.max(0, flash - dt * 1.5); edgeGlow = Math.max(0, edgeGlow - dt * 1.5);
  comboT -= dt; payAccT -= dt;
  if (payAccT <= 0 && payAcc > 0) { const [x, y] = edgePoint(payAccX); floatText('+' + payAcc, x, y - 10, '#ffd75c', payAcc >= 10 ? 22 : 16, 0.9, -60); payAcc = 0; }
  bankShown += (game.bank - bankShown) * Math.min(1, dt * 10); if (Math.abs(game.bank - bankShown) < 0.5) bankShown = game.bank;
  scoreShown += (game.score - scoreShown) * Math.min(1, dt * 8); if (Math.abs(game.score - scoreShown) < 1) scoreShown = game.score;
  scorePop = Math.max(0, scorePop - dt * 4); comboPop = Math.max(0, comboPop - dt * 3);
  bankPop = Math.max(0, bankPop - dt * 4);
  if (tip) { tip.t += dt; if (tip.t > 4) tip = null; }
  for (const f of fx.bankFly) f.t += dt;
  if (fx.bankFly.some((f) => f.t >= f.dur)) { scorePop = 1; S.tick(0.3); }
  fx.bankFly = fx.bankFly.filter((f) => f.t < f.dur);
  for (const p of fx.parts) { p.life -= dt; p.vy += p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
  fx.parts = fx.parts.filter((p) => p.life > 0);
  if (fx.parts.length > 600) fx.parts.splice(0, fx.parts.length - 600);
  for (const f of fx.floats) { f.life -= dt; f.y += f.vy * dt; f.vy *= 0.96; }
  fx.floats = fx.floats.filter((f) => f.life > 0);
  for (const b of fx.banners) b.t += dt;
  fx.banners = fx.banners.filter((b) => b.t < b.dur);
  for (const l of fx.lasers) l.life -= dt; fx.lasers = fx.lasers.filter((l) => l.life > 0);
  for (const r of fx.rings) { r.life -= dt; r.r += dt * 160; } fx.rings = fx.rings.filter((r) => r.life > 0);
  for (const T of game.f.towers) if (T.state === 'stand' && (T.tilt || 0) > 0.04 && Math.random() < dt * 3) S.creak();
  B.shake = shake * 0.6;
  document.getElementById('itemBtn').classList.toggle('can', game.canBuy('wheel'));
  saveT += dt; if (saveT > 5) { saveT = 0; save(); }
}

// ------------------------------------------------------------------------------------------------ draw
const stars = Array.from({ length: 70 }, (_, i) => [((i * 7919) % 1000) / 1000, ((i * 104729) % 1000) / 1000, ((i * 31) % 10) / 10]);
function draw() {
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, VW, VH);
  if (view) view.render(game, t, { edgeGlow, shooter });
  const sx = shake ? (Math.random() - 0.5) * shake : 0, sy = shake ? (Math.random() - 0.5) * shake : 0;
  g.save(); g.translate(sx, sy);
  // battle screen
  drawBattle(g, L.battle, game, B, t, dpr);
  drawBattleFx();
  g.restore();
  drawHUD();
  drawBar();
  // particles + floating text on top of everything
  for (const p of fx.parts) { g.globalAlpha = clamp(p.life / p.max, 0, 1); g.fillStyle = p.col; g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); }
  g.globalAlpha = 1;
  for (const f of fx.flyers) {
    const s = B.slots[Math.min(ROW - 1, B.row.length + fx.flyers.indexOf(f))] || [VW / 2, L.battle.y + 20, 30];
    const k = ease(f.t / f.dur), x = lerp(f.x0, s[0], k), y = lerp(f.y0, s[1], k) - Math.sin(k * Math.PI) * 80, sz = lerp(26, s[2] * 0.9, k) * (1 + Math.sin(k * Math.PI) * 0.4);
    g.shadowColor = COLS[f.k].glow; g.shadowBlur = 16; g.drawImage(sprite(f.k), x - sz / 2, y - sz / 2, sz, sz); g.shadowBlur = 0;
  }
  for (const f of (fx.flyers2 || [])) { const k = ease(f.t / f.dur), x = lerp(f.x0, f.x1, k), y = lerp(f.y0, f.y1, k) - Math.sin(k * Math.PI) * 30, sz = 30 * (1 - k * 0.6); g.globalAlpha = 1 - k * 0.5; g.drawImage(sprite(f.k), x - sz / 2, y - sz / 2, sz, sz); g.globalAlpha = 1; }
  for (const f of fx.bankFly) {
    const k = f.t / f.dur, e2 = k * k, tx = L.hud.x + L.hud.w * 0.5, ty = L.hud.y + L.hud.h / 2;
    const x = lerp(f.x0, tx, e2) + Math.sin(k * Math.PI) * 40, y = lerp(f.y0, ty, e2), sz = 16 - k * 6;
    g.drawImage(sprite(f.gold ? 'g' : 'c'), x - sz / 2, y - sz / 2, sz, sz);
  }
  for (const f of fx.floats) { const a = clamp(f.life / f.max * 2, 0, 1), sc = 1 + Math.max(0, (f.life - f.max + 0.15)) * 3; g.globalAlpha = a; txt(g, f.text, f.x, f.y, f.size * sc, f.col); g.globalAlpha = 1; }
  // first-time hints
  if (started && !paused && game.stats.shots < 6 && !wheel) {
    const hy = L.mach.y + L.mach.h * 0.6, p = 0.5 + 0.5 * Math.sin(t * 5);
    for (const fx_ of [0.25, 0.75]) {
      const hx = L.gx + L.gw * fx_;
      g.strokeStyle = `rgba(255,215,92,${0.5 + p * 0.5})`; g.lineWidth = 3; g.beginPath(); g.arc(hx, hy, 16 + p * 9, 0, TAU); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.arc(hx, hy, 8, 0, TAU); g.fill();
      txt(g, fx_ < 0.5 ? 'LEFT' : 'RIGHT', hx, hy + 36, 13, '#fff');
    }
    txt(g, 'HOLD TO SHOOT', L.gx + L.gw / 2, hy + 66, 17, '#ffd75c', { glow: '#ff8a1f' });
  }
  if (tip && tip.t < 4) {
    const a = tip.t < 0.3 ? tip.t / 0.3 : tip.t > 3.5 ? (4 - tip.t) / 0.5 : 1;
    const s0 = B.slots[0], s5 = B.slots[ROW - 1];
    if (s0 && s5) { g.globalAlpha = a; rr(g, s0[0] - 30, s0[1] + s0[2] * 0.6 + 4, s5[0] - s0[0] + 60, 26, 13); g.fillStyle = 'rgba(8,4,24,0.92)'; g.fill(); g.strokeStyle = '#ffd75c'; g.lineWidth = 1.5; g.stroke();
      txt(g, tip.text, (s0[0] + s5[0]) / 2, s0[1] + s0[2] * 0.6 + 17, 11, '#fff', { lw: 2 }); g.globalAlpha = 1; }
  }
  // wheel overlay
  if (wheel) drawWheelOverlay();
  // banners
  for (const b of fx.banners) {
    const k = b.t / b.dur, sc = b.t < 0.25 ? backOut(b.t / 0.25) : 1, a = k > 0.8 ? (1 - k) / 0.2 : 1;
    const by = wheel ? wheelGeo().cy + wheelGeo().R * 1.25 + 30 : L.mach.y + L.mach.h * 0.2;
    g.save(); g.globalAlpha = a; g.translate(L.gx + L.gw / 2, by); g.scale(sc, sc);
    const size = Math.min(40, L.gw * 0.09) * b.big;
    txt(g, b.text, 0, 0, size, b.col, { glow: b.col, lw: size * 0.22 });
    if (b.sub) txt(g, b.sub, 0, size * 0.85, size * 0.38, '#fff', { lw: 3 });
    g.restore();
  }
  if (flash > 0) { g.fillStyle = `rgba(255,255,255,${flash})`; g.fillRect(0, 0, VW, VH); }
  if (game.fever > 0) {
    const hue = (t * 200) % 360; g.strokeStyle = `hsla(${hue},100%,60%,${0.5 + 0.3 * Math.sin(t * 10)})`; g.lineWidth = 6; g.strokeRect(L.gx + 3, 3, L.gw - 6, VH - 6);
  }
}
function drawBattleFx() {
  const R = L.battle;
  g.save(); rr(g, R.x, R.y, R.w, R.h, 14); g.clip();
  for (const l of fx.lasers) { const a = l.life / l.max; g.strokeStyle = `rgba(92,208,255,${a})`; g.lineWidth = 3 * a + 1; g.shadowColor = '#5cd0ff'; g.shadowBlur = 8; g.beginPath(); g.moveTo(l.x0, l.y0); g.lineTo(lerp(l.x0, l.x1, 1), l.y1); g.stroke(); g.shadowBlur = 0; }
  for (const s of fx.shots) {
    const k = clamp(s.t / s.dur, 0, 1), x = lerp(s.x0, s.x1, k), y = lerp(s.y0, s.y1, k) - Math.sin(k * Math.PI) * 20;
    const C = COLS[s.col];
    if (s.kind === 'wave') { for (let i = 0; i < 3; i++) { g.strokeStyle = C.light; g.globalAlpha = 1 - i * 0.3; g.lineWidth = 4 - i; g.beginPath(); g.arc(x - i * 10, y, 14 + i * 4, -0.9, 0.9); g.stroke(); } g.globalAlpha = 1; }
    else { txt(g, '♪', x, y, 26, C.main, { glow: C.glow }); txt(g, '♫', x - 18, y + 10, 16, C.light); }
  }
  for (const r of fx.rings) { g.strokeStyle = r.col; g.globalAlpha = r.life / r.max; g.lineWidth = 3; g.beginPath(); g.arc(r.x, r.y, r.r, 0, TAU); g.stroke(); g.globalAlpha = 1; }
  g.restore();
}
function drawHUD() {
  const H = L.hud, cy = H.y + H.h / 2;
  // coins to shoot
  const cx = H.x + 24, pop = 1 + bankPop * 0.25;
  g.save(); g.translate(cx, cy); g.scale(pop, pop); g.drawImage(sprite('c'), -13, -13, 26, 26); g.restore();
  txt(g, String(Math.round(bankShown)), cx + 19, cy, 21, game.bank > 0 ? '#e8eef8' : '#ff6b74', { align: 'left' });
  if (game.bank < REGEN_BELOW) { const k = game.regen / REGEN_EVERY, bx = cx + 19; g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(bx, cy + 13, 44, 3); g.fillStyle = '#5cd0ff'; g.fillRect(bx, cy + 13, 44 * k, 3); }
  // points
  const sx = H.x + H.w * 0.5, sp = 1 + scorePop * 0.15;
  g.save(); g.translate(sx, cy - 3); g.scale(sp, sp);
  txt(g, Math.round(scoreShown).toLocaleString('en-US'), 0, 0, 22, '#ffd75c', { glow: 'rgba(255,200,60,0.5)', blur: 8 * scorePop });
  g.restore();
  txt(g, 'POINTS', sx, cy + 14, 7, '#9fc6ea', { lw: 2 });
  // combo meter
  const mx = H.x + H.w * 0.68, mw = H.w * 0.2, my = cy - 8, fev = game.fever > 0;
  const cp = 1 + comboPop * 0.3;
  txt(g, fev ? 'x2' : 'x' + comboMult(game.combo).toFixed(2).replace(/0$/, '').replace(/\.0$/, ''), mx + mw / 2, my + 1, 12 * cp, fev ? '#fff' : '#ffd75c', { lw: 3 });
  for (let i = 0; i < COMBO_FULL; i++) {
    const w = mw / COMBO_FULL, x = mx + i * w;
    rr(g, x + 1, my + 9, w - 2, 7, 3);
    g.fillStyle = fev ? `hsl(${(t * 300 + i * 40) % 360},100%,62%)` : i < game.meter ? ['#2fb4ff', '#ff4fb0', '#ffc21f'][i % 3] : 'rgba(255,255,255,0.15)'; g.fill();
  }
  txt(g, fev ? `DOUBLE ${Math.ceil(game.fever)}s` : `COMBO ${game.combo}`, mx + mw / 2, my + 23, 7, fev ? '#fff' : '#9fc6ea', { lw: 2 });
  // running items
  let ix = L.mach.x + 8;
  for (const [id, tt] of [['guard', game.guardT], ['turbo', game.turboT]]) {
    if (!(tt > 0)) continue;
    rr(g, ix, L.mach.y + 4, 62, 18, 9); g.fillStyle = 'rgba(8,4,24,0.8)'; g.fill(); g.strokeStyle = ICON[id][1]; g.lineWidth = 1.5; g.stroke();
    txt(g, ICON[id][0] + ' ' + Math.ceil(tt) + 's', ix + 31, L.mach.y + 13.5, 10, '#fff', { lw: 2 });
    ix += 68;
  }
}
function drawBar() {
  const R = L.bar;
  g.fillStyle = 'rgba(8,4,24,0.9)'; g.fillRect(R.x, R.y, R.w, VH - R.y);
  g.strokeStyle = 'rgba(92,208,255,0.4)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(R.x, R.y); g.lineTo(R.x + R.w, R.y); g.stroke();
}
function wheelGeo() {
  const R = Math.min(L.gw * 0.43, (L.mach.y + L.mach.h * 0.45 - L.battle.y) * 0.47);
  return { R, cx: L.gx + L.gw / 2, cy: L.battle.y + R * 1.12 + 16 };
}
function drawWheelOverlay() {
  const Wh = wheel;
  const a = Wh.phase === 'in' ? ease(Wh.t / 0.6) : Wh.phase === 'out' ? 1 - ease(Wh.t / 0.45) : 1;
  g.fillStyle = `rgba(4,2,16,${0.7 * a})`; g.fillRect(0, 0, VW, VH);
  const { R, cx, cy } = wheelGeo();
  g.save(); g.translate(cx, cy); const sc = 0.4 + 0.6 * backOut(a); g.scale(sc, sc); g.globalAlpha = a;
  drawWheel(g, 0, 0, R, Wh.rot || 0, Wh.phase === 'spin' || Wh.phase === 'show' ? Wh.ball : null, t, Wh.phase === 'show' ? Wh.pocket : -1, Wh.t, Wh.phase === 'spin' ? 18 : 6);
  g.restore();
  if (Wh.phase === 'show') txt(g, 'TAP TO CONTINUE', cx, cy + R * 1.25 + 92, 11, 'rgba(255,255,255,0.7)', { lw: 3 });
}

// ------------------------------------------------------------------------------------------------ loop
function frame(ts) {
  const dt = Math.min(0.05, Math.max(0, (ts - last) / 1000 || 0));
  last = ts;
  if (started) update(paused ? 0 : dt);
  draw();
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------------------------------------------ items
const ICON = { quake: ['≋', '#ff8a1f'], guard: ['▮▮', '#2fb4ff'], turbo: ['»', '#2bd67b'], rain: ['●●', '#ff4fb0'], wheel: ['◎', '#ffc21f'] };
function buildShop() {
  const list = document.getElementById('itemList'); list.innerHTML = '';
  for (const id of ITEM_ORDER) {
    const I = ITEMS[id], b = document.createElement('button');
    b.className = 'item'; b.dataset.id = id; b.disabled = !game.canBuy(id);
    b.innerHTML = `<div class="ic" style="background:${ICON[id][1]}">${ICON[id][0]}</div><div class="tx"><b>${I.name}</b>${I.desc}</div><div class="cost">${game.itemCost(id).toLocaleString('en-US')}</div>`;
    b.addEventListener('click', () => { if (game.buy(id)) { S.click(); show('shop', false); paused = false; } });
    list.appendChild(b);
  }
}
document.getElementById('itemBtn').addEventListener('click', () => { if (!started) return; A.unlock(); S.click(); buildShop(); show('shop', true); paused = true; });
document.getElementById('shopClose').addEventListener('click', () => { S.click(); show('shop', false); paused = false; });

// ------------------------------------------------------------------------------------------------ menus
const $ = (id) => document.getElementById(id);
function show(id, on) { $(id).classList.toggle('show', on); }
function toggleMenu() { if (!started) return; const on = !$('menu').classList.contains('show'); show('menu', on); paused = on; if (on) { refreshMenu(); save(); } }
function refreshMenu() {
  $('sfxBtn').textContent = 'Sound: ' + (A.prefs.sfx ? 'ON' : 'OFF');
  $('musBtn').textContent = 'Music: ' + (A.prefs.music ? 'ON' : 'OFF');
  const s = game.stats;
  $('stats').innerHTML = `Enemies beaten <b>${s.kills}</b> · Towers <b>${s.towers}</b> · Jackpots <b>${s.jp}</b><br>Coins shot <b>${s.shots}</b> · Coins won <b>${s.paid}</b> · Attacks <b>${s.attacks}</b>`;
}
$('menuBtn').addEventListener('click', () => { A.unlock(); S.click(); toggleMenu(); });
$('resumeBtn').addEventListener('click', () => { S.click(); toggleMenu(); });
$('sfxBtn').addEventListener('click', () => { A.setSfx(!A.prefs.sfx); refreshMenu(); S.click(); });
$('musBtn').addEventListener('click', () => { A.setMusic(!A.prefs.music); refreshMenu(); });
$('howBtn').addEventListener('click', () => { S.click(); show('menu', false); show('how', true); });
$('howGo').addEventListener('click', () => { S.click(); show('how', false); paused = false; seen = true; save(); });
$('resetBtn').addEventListener('click', () => {
  if (!confirm('Start a brand new machine? Your heroes, coins and progress reset.')) return;
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* */ }
  game = new Game((Date.now() & 0xffffff) || 1, new Machine()); game.newMachine(); syncView(); actions = []; wheel = null; dying = null; killPending = false;
  fx.flyers = []; fx.shots = [];
  show('menu', false); paused = false; save();
});
$('playBtn').addEventListener('click', () => {
  A.unlock(); Music.start(); S.click();
  show('title', false); started = true;
  if (!seen) { show('how', true); paused = true; } else paused = false;
  if (welcomeBack) { banner('WELCOME BACK', '#5cd0ff', `+${welcomeBack} free coins`, 1.8, 0.9); welcomeBack = 0; }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) { save(); if (started && !$('menu').classList.contains('show') && !$('how').classList.contains('show')) toggleMenu(); } });
window.addEventListener('pagehide', save);

// ------------------------------------------------------------------------------------------------ boot
// Physics (Rapier, WebAssembly) loads first; PLAY unlocks when the machine is ready.
const playEl = $('playBtn');
playEl.disabled = true; playEl.textContent = 'LOADING…';
buildSprites();
(async () => {
  try {
    await loadPhysics();
    view = new View3D(cv3);
    game = loadGame();
    syncView();
    layout();
    playEl.disabled = false; playEl.textContent = 'PLAY';
    requestAnimationFrame(frame);
  } catch (e) {
    console.error(e);
    playEl.textContent = 'This device cannot run the 3D machine';
  }
})();
window.GP = {
  get game() { return game; }, get L() { return L; }, get cam() { return cam; }, get view() { return view; }, B, fx, get wheel() { return wheel; }, save,
  start: () => $('playBtn').click(),
  ready: () => !!game && !playEl.disabled,
  // fast-forward: run the game for `sec` seconds of game time right now (tests use it; frame rate does not matter)
  ff: (sec) => { for (let i = 0; i < Math.round(sec * 60); i++) update(1 / 60); },
};
